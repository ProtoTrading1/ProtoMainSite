import { readSiteConfigJson } from './_site-config.js';
import { getPortalAdminClient } from './_site-config.js';
import { advanceOrderStatus } from './_order-status.js';
import {
  generateAndStoreOrderPdf,
  loadOrderForPdf,
  buildOrderSummary,
  formatPlacedAt,
} from './_order-pdf.js';

const USERS_FILE = 'fulfillment/users.json';
const ORDER_TEMPLATE = process.env.WATI_ORDER_TEMPLATE || 'proto_orders';

function watiConfig() {
  const baseUrl = (process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950').replace(/\/$/, '');
  const token = process.env.WATI_API_TOKEN;
  return { baseUrl, token };
}

function normalizeWhatsapp(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `27${digits.slice(1)}`;
  return digits;
}

async function watiAddContact(baseUrl, token, phone, name) {
  try {
    await fetch(`${baseUrl}/api/v1/addContact`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'Fulfilment', phoneNumber: phone }),
    });
  } catch { /* best-effort */ }
}

async function watiSendTemplate(baseUrl, token, phone, parameters) {
  const res = await fetch(`${baseUrl}/api/v1/sendTemplateMessage?whatsappNumber=${phone}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_name: ORDER_TEMPLATE,
      broadcast_name: ORDER_TEMPLATE,
      parameters,
    }),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok || json?.result === false) {
    throw new Error(json?.info || json?.message || json?.error || `WATI send failed (${res.status})`);
  }
  return json;
}

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

/** Notify fulfilment team via WATI and advance order to Handed Over when email already sent. */
export async function runOrderTeamNotify(orderId, { emailSent = false } = {}) {
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
  const fulfillmentUrl = `${adminUrl}/fulfillment?id=${orderId}`;
  const pdfButtonSuffix = `${orderId}/pdf`;

  const parameters = [
    { name: '1', value: placedAt },
    { name: '2', value: customerName },
    { name: '3', value: summary },
    { name: '4', value: fulfillmentUrl },
    { name: '5', value: pdfButtonSuffix },
  ];

  const { baseUrl, token } = watiConfig();
  const sent = [];
  const failed = [];

  if (token) {
    let users = [];
    try {
      const data = await readSiteConfigJson(USERS_FILE, { users: [] });
      users = Array.isArray(data?.users) ? data.users : [];
    } catch (err) {
      console.error('order-notify: failed to load fulfillment users:', err.message);
    }

    const recipients = users
      .map((u) => ({ name: String(u.name || '').trim(), phone: normalizeWhatsapp(u.whatsapp) }))
      .filter((u) => u.phone);

    const seen = new Set();
    for (const recipient of recipients) {
      if (seen.has(recipient.phone)) continue;
      seen.add(recipient.phone);
      try {
        await watiAddContact(baseUrl, token, recipient.phone, recipient.name);
        await watiSendTemplate(baseUrl, token, recipient.phone, parameters);
        sent.push(recipient.phone);
      } catch (err) {
        console.error(`order-notify: WATI send failed for ${recipient.name} (${recipient.phone}):`, err.message);
        failed.push({ name: recipient.name, phone: recipient.phone, error: err.message });
      }
    }
  } else {
    console.warn('order-notify: WATI_API_TOKEN not configured — skipping WhatsApp broadcast');
  }

  let statusAdvanced = false;
  if (emailSent) {
    try {
      const result = await markHandedOver(orderId);
      statusAdvanced = result.ok;
      if (!result.ok && result.reason !== 'sequential-only') {
        console.warn('order-notify: status advance skipped:', result.reason);
      }
    } catch (err) {
      console.error('order-notify: failed to set handed over status:', err.message);
    }
  }

  return {
    ok: true,
    orderId,
    pdfStored,
    template: ORDER_TEMPLATE,
    sent: sent.length,
    failed: failed.length,
    failedList: failed.slice(0, 25),
    statusAdvanced,
  };
}
