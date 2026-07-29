import { createHash } from 'node:crypto';
import { readSiteConfigJson, saveOrderNotifyLog, writeSiteConfigJson } from './_site-config.js';
import { getPortalAdminClient } from './_site-config.js';
import { advanceOrderStatus } from './_order-status.js';
import {
  generateAndStoreOrderPdf,
  loadOrderForPdf,
  buildOrderSummary,
  formatPlacedAt,
} from './_order-pdf.js';
import {
  watiConfig,
  normalizeWhatsapp,
  sanitizeTemplateParam,
  watiEnsureContact,
  watiSendTemplate,
  watiSendSessionMessage,
  buildSessionOrderMessage,
} from './_wati-notify.js';
import { orderToken } from './_order-token.js';
import { APP_ORIGIN } from './_public-site-url.js';

const USERS_FILE = 'fulfillment/users.json';
const ORDER_TEMPLATE = process.env.WATI_ORDER_TEMPLATE || 'proto_order_notis';
const ORDER_TEMPLATE_CATEGORY = (process.env.WATI_ORDER_TEMPLATE_CATEGORY || 'UTILITY').toUpperCase();
// This builds the TEAM's order-PDF download link, not a customer link, so it
// follows APP_ORIGIN — the host that actually serves /api/orders/:id/pdf. The
// old default was the raw Vercel host; pointing it at the migration target
// instead would 404 until DNS moves and leave the team unable to open an order.
const MAIN_PORTAL_URL = (process.env.MAIN_PORTAL_URL || process.env.VITE_APP_URL || APP_ORIGIN).replace(/\/$/, '');

async function markHandedOver(orderId) {
  const supabase = getPortalAdminClient();
  const result = await advanceOrderStatus(supabase, orderId, 'handed over');
  if (result.ok) {
    const progress = await readSiteConfigJson(`fulfillment/progress/${orderId}.json`, null);
    const hasSavedSection = progress?.sections
      && Object.values(progress.sections).some((s) => s?.savedAt || s?.complete);
    if (hasSavedSection) {
      await advanceOrderStatus(supabase, orderId, 'order in progress');
    }
  }
  return result;
}

async function notifyRecipient(baseUrl, token, recipient, ctx) {
  const { placedAt, customerName, summary, fulfillmentUrl, pdfUrl, orderRef } = ctx;
  const detail = { name: recipient.name, phone: recipient.phone, template: null, session: null };

  await watiEnsureContact(baseUrl, token, recipient.phone, recipient.name);

  // proto_order_notis (UTILITY) has 4 body variables only and no buttons.
  // {{1}} Time · {{2}} Order from · {{3}} Order Summary · {{4}} Order Link
  // We only send the short fulfillment link in {{4}} — the PDF is reachable
  // from a button inside the page so the WhatsApp message stays tidy.
  const parameters = [
    { name: '1', value: sanitizeTemplateParam(placedAt, 120) },
    { name: '2', value: sanitizeTemplateParam(customerName, 120) },
    { name: '3', value: sanitizeTemplateParam(summary, 900) },
    { name: '4', value: sanitizeTemplateParam(fulfillmentUrl, 900) },
  ];

  const templateResult = await watiSendTemplate(baseUrl, token, recipient.phone, parameters);
  detail.template = {
    ok: templateResult.success,
    error: templateResult.error || null,
    messageId: templateResult.messageId || null,
  };

  const sessionText = buildSessionOrderMessage({
    placedAt,
    customerName,
    summary,
    fulfillmentUrl,
    pdfUrl,
    orderRef,
  });

  let sessionResult = null;
  const useSessionBackup = process.env.WATI_ORDER_SESSION_BACKUP !== 'false';
  if (useSessionBackup || !templateResult.success) {
    sessionResult = await watiSendSessionMessage(baseUrl, token, recipient.phone, sessionText);
    detail.session = {
      ok: sessionResult.success,
      error: sessionResult.error || null,
    };
  }

  const templateOk = templateResult.success;
  const sessionOk = sessionResult?.success ?? false;
  const sessionExpired = /ticket has been expired|24.?hour|session expired/i.test(sessionResult?.error || '');

  if (templateOk || sessionOk) {
    const method = templateOk && sessionOk ? 'both' : templateOk ? 'template' : 'session';
    const marketingMaybeBlocked = templateOk && !sessionOk && sessionExpired;
    return {
      ok: true,
      method,
      marketingMaybeBlocked,
      messageId: templateResult.messageId || null,
      detail,
    };
  }

  const combinedError = [
    templateResult.error ? `Template: ${templateResult.error}` : null,
    sessionResult?.error ? `Session: ${sessionResult.error}` : null,
  ].filter(Boolean).join(' · ') || 'WhatsApp delivery failed';

  return { ok: false, method: null, error: combinedError, detail };
}

function messageIndexFile(messageId) {
  const digest = createHash('sha256').update(String(messageId)).digest('hex');
  return `orders/notify-index/${digest}.json`;
}

/** Notify fulfilment team via WATI. API acceptance is not delivery proof. */
export async function runOrderTeamNotify(orderId, {
  emailSent = false,
  emailRecipients = [],
  emailMessageId = null,
  emailFailReason = null,
  emailAttemptCount = 0,
  emailProviderStatus = null,
  pdfAttached = false,
  pdfSource = null,
} = {}) {
  let order;
  let items;
  let customer;
  let pdfStored = false;

  try {
    const result = await generateAndStoreOrderPdf(orderId);
    order = result.order;
    items = result.items;
    customer = result.customer;
    pdfStored = true;
  } catch (err) {
    console.error('order-notify: PDF generation failed:', err.message);
    const ctx = await loadOrderForPdf(orderId);
    order = ctx.order;
    items = ctx.items;
    customer = ctx.customer;
  }

  const adminUrl = (process.env.ADMIN_PORTAL_URL || 'https://protoportal-admin.vercel.app').replace(/\/$/, '');
  const placedAt = formatPlacedAt(order.created_at);
  const customerName = String(customer?.name || customer?.business_name || 'Customer').trim();
  const summary = buildOrderSummary(items);
  const accessToken = orderToken(orderId);
  // Short URL handled by Vercel rewrite: /f/:id/:token -> /fulfillment?o=:id&k=:token
  const fulfillmentUrl = accessToken
    ? `${adminUrl}/f/${orderId}/${accessToken}`
    : `${adminUrl}/fulfillment?id=${orderId}`;
  const pdfUrl = `${MAIN_PORTAL_URL}/api/orders/${orderId}/pdf${accessToken ? `?k=${accessToken}` : ''}`;
  const orderRef = String(order?.order_ref || order?.reference || '').trim();

  const notifyCtx = { placedAt, customerName, summary, fulfillmentUrl, pdfUrl, orderRef };

  const { baseUrl, token } = watiConfig();
  const sent = [];
  const failed = [];
  const deliveryLog = [];

  let users = [];
  try {
    const data = await readSiteConfigJson(USERS_FILE, { users: [] });
    users = Array.isArray(data?.users) ? data.users : [];
  } catch (err) {
    console.error('order-notify: failed to load fulfillment users:', err.message);
  }

  const recipients = users
    // Existing records do not have orderAlerts, so only an explicit false opts out.
    .filter((u) => u?.orderAlerts !== false)
    .map((u) => {
      const phone = normalizeWhatsapp(u.whatsapp || u.phone || '');
      return { name: String(u.name || '').trim(), phone };
    })
    .filter((u) => u.phone);

  const seen = new Set();
  const uniqueRecipients = recipients.filter((r) => {
    if (seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });

  if (!token) {
    console.error('order-notify: WATI_API_TOKEN is not set on the main portal — team WhatsApp alerts are disabled. Copy WATI_API_TOKEN and WATI_API_URL from the admin Vercel project.');
  } else if (!uniqueRecipients.length) {
    console.warn('order-notify: no fulfilment team WhatsApp numbers configured — save team members in Admin → Order Requests → Team');
  } else {
    for (const recipient of uniqueRecipients) {
      try {
        const result = await notifyRecipient(baseUrl, token, recipient, notifyCtx);
        deliveryLog.push(result.detail);
        if (result.ok) {
          sent.push({
            phone: recipient.phone,
            name: recipient.name,
            method: result.method,
            messageId: result.messageId || null,
            deliveryStatus: result.messageId ? 'accepted' : 'accepted-untracked',
            marketingMaybeBlocked: Boolean(result.marketingMaybeBlocked),
          });
        } else {
          failed.push({
            name: recipient.name,
            phone: recipient.phone,
            error: result.error,
          });
        }
      } catch (err) {
        console.error(`order-notify: WATI send failed for ${recipient.name} (${recipient.phone}):`, err.message);
        failed.push({ name: recipient.name, phone: recipient.phone, error: err.message });
      }
    }
  }

  const allTeamAccepted = uniqueRecipients.length > 0 && sent.length === uniqueRecipients.length;
  const whatsappAccepted = !token ? false : allTeamAccepted;

  let statusAdvanced = false;
  let statusBlockedReason = null;

  // WhatsApp is a secondary alert. A safely stored order with its operational
  // email must not remain stuck in New while waiting for WATI delivery proof.
  if (emailSent && pdfStored) {
    try {
      const result = await markHandedOver(orderId);
      statusAdvanced = result.ok;
      if (!result.ok && result.reason !== 'sequential-only') {
        statusBlockedReason = result.reason;
        console.warn('order-notify: status advance skipped:', result.reason);
      }
    } catch (err) {
      statusBlockedReason = err.message;
      console.error('order-notify: failed to set handed over status:', err.message);
    }
  } else {
    statusBlockedReason = !emailSent
      ? 'Internal order email was not accepted'
      : 'Order PDF was not stored';
    console.warn('order-notify: keeping order pending —', statusBlockedReason);
  }

  const notifyLog = {
    orderId,
    template: ORDER_TEMPLATE,
    templateCategory: ORDER_TEMPLATE_CATEGORY,
    marketingWarning:
      ORDER_TEMPLATE_CATEGORY !== 'UTILITY' && sent.some((s) => s.marketingMaybeBlocked)
        ? `${ORDER_TEMPLATE} is a Marketing template — Meta may block delivery unless the recipient opted in or messaged your business recently. Recreate as UTILITY in WATI for reliable order alerts.`
        : null,
    pdfStored,
    teamSize: uniqueRecipients.length,
    accepted: sent.length,
    sent: sent.length,
    failed: failed.length,
    sentList: sent.map((s) => s.phone),
    sentDetails: sent.slice(0, 25),
    failedList: failed.slice(0, 25),
    deliveryLog: deliveryLog.slice(0, 25),
    statusAdvanced,
    statusBlockedReason,
    emailSent: Boolean(emailSent),
    emailRecipients: Array.isArray(emailRecipients) ? emailRecipients.slice(0, 25) : [],
    emailMessageId: emailMessageId || null,
    emailFailReason: emailFailReason || null,
    emailAttemptCount: Number(emailAttemptCount) || 0,
    emailProviderStatus: emailProviderStatus != null ? Number(emailProviderStatus) : null,
    emailPdfAttached: Boolean(pdfAttached),
    emailPdfSource: pdfSource || null,
    delivered: 0,
    read: 0,
    deliveryFailed: 0,
    whatsappAccepted,
    deliveryConfirmed: false,
    at: new Date().toISOString(),
    ok: emailSent && pdfStored,
    skippedNoToken: !token,
    skippedNoTeam: uniqueRecipients.length === 0,
  };

  try {
    await saveOrderNotifyLog(orderId, notifyLog);
    await Promise.all(
      sent
        .filter((entry) => entry.messageId)
        .map((entry) => writeSiteConfigJson(messageIndexFile(entry.messageId), {
          orderId,
          messageId: entry.messageId,
          phone: entry.phone,
        })),
    );
  } catch (err) {
    console.error('order-notify: failed to save notify log:', err.message);
  }

  return {
    ok: emailSent && pdfStored,
    orderId,
    pdfStored,
    template: ORDER_TEMPLATE,
    teamSize: uniqueRecipients.length,
    accepted: sent.length,
    sent: sent.length,
    failed: failed.length,
    sentDetails: sent.slice(0, 25),
    failedList: failed.slice(0, 25),
    statusAdvanced,
    statusBlockedReason,
    whatsappErrors: failed.length ? failed : undefined,
  };
}
