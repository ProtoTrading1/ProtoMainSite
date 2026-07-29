import { readSiteConfigJson, saveOrderNotifyLog } from './_site-config.js';
import { getPortalAdminClient } from './_site-config.js';
import { advanceOrderStatus } from './_order-status.js';
import { generateAndStoreOrderPdf, loadOrderForPdf } from './_order-pdf.js';

// WhatsApp/WATI order notifications were removed entirely (2026-07): the team
// is notified by EMAIL (send-order.js + the admin new-order alert). This module
// keeps the two responsibilities that outlive that removal — storing the
// fulfilment PDF and advancing the order's workflow status — plus the notify
// log the admin portal audits.

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

/** Store the fulfilment PDF, advance status, and record the notify log. */
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
  let pdfStored = false;

  try {
    await generateAndStoreOrderPdf(orderId);
    pdfStored = true;
  } catch (err) {
    console.error('order-notify: PDF generation failed:', err.message);
    // The order itself must still be loadable — surface a broken order id now
    // rather than logging success for an order that cannot be opened.
    await loadOrderForPdf(orderId);
  }

  let statusAdvanced = false;
  let statusBlockedReason = null;

  // A safely stored order with its operational email must not remain stuck in
  // New — the email IS the notification now.
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
    pdfStored,
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
    // WhatsApp notifications are removed; the flag tells the admin audit that
    // email alone completes the notification round (old logs may still carry
    // per-message WhatsApp fields).
    whatsappNotConfigured: true,
    at: new Date().toISOString(),
    ok: emailSent && pdfStored,
  };

  try {
    await saveOrderNotifyLog(orderId, notifyLog);
  } catch (err) {
    console.error('order-notify: failed to save notify log:', err.message);
  }

  return {
    ok: emailSent && pdfStored,
    orderId,
    pdfStored,
    statusAdvanced,
    statusBlockedReason,
  };
}
