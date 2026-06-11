import { requireAuth } from './_auth.js';
import { readSiteConfigJson } from './_site-config.js';
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

// Strip to digits and normalise SA numbers to international (no leading +).
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
  } catch { /* addContact is best-effort; sending may still succeed */ }
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const orderId = String(req.body?.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  const { baseUrl, token } = watiConfig();
  if (!token) {
    console.error('order-notify: WATI_API_TOKEN not configured');
    return res.status(200).json({ ok: false, reason: 'wati-not-configured' });
  }

  // 1) Generate + store the PDF. If this fails we still send WhatsApp (without
  //    a guaranteed-instant PDF — the endpoint regenerates on demand anyway).
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
    try {
      const ctx = await loadOrderForPdf(orderId);
      order = ctx.order;
      items = ctx.items;
      customer = ctx.customer;
    } catch (loadErr) {
      console.error('order-notify: order load failed:', loadErr.message);
      return res.status(404).json({ error: 'Order not found' });
    }
  }

  // 2) Build the 4 template parameters (shared by all recipients).
  const siteUrl = (process.env.SITE_URL || 'https://protoportal-main.vercel.app').replace(/\/$/, '');
  const adminUrl = (process.env.ADMIN_PORTAL_URL || 'https://protoportal-admin.vercel.app').replace(/\/$/, '');

  const placedAt = formatPlacedAt(order.created_at);
  const customerName = String(customer?.name || customer?.business_name || 'Customer').trim();
  const summary = buildOrderSummary(items);
  const fulfillmentUrl = `${adminUrl}/fulfillment?id=${orderId}`;
  // WhatsApp dynamic URL buttons only append a trailing suffix to a fixed base.
  // Template button base URL must be: `${siteUrl}/api/orders/`  → final URL
  // resolves to `${siteUrl}/api/orders/${orderId}/pdf`.
  const pdfButtonSuffix = `${orderId}/pdf`;

  const parameters = [
    { name: '1', value: placedAt },
    { name: '2', value: customerName },
    { name: '3', value: summary },
    { name: '4', value: fulfillmentUrl },
    // {{5}} = dynamic URL button suffix for the "Download PDF" button.
    { name: '5', value: pdfButtonSuffix },
  ];

  // 3) Load ALL fulfillment team members and broadcast to everyone with a
  //    valid WhatsApp number (recipient selection is no longer category-based).
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

  const sent = [];
  const failed = [];
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

  return res.status(200).json({
    ok: true,
    orderId,
    pdfStored,
    template: ORDER_TEMPLATE,
    recipients: recipients.length,
    sent: sent.length,
    failed: failed.length,
    failedList: failed.slice(0, 25),
  });
}
