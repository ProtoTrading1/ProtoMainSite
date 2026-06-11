const ORDER_TEMPLATE = process.env.WATI_ORDER_TEMPLATE || 'proto_order_notis';

export function watiConfig() {
  const baseUrl = (process.env.WATI_API_URL || 'https://live-mt-server.wati.io/10138950').replace(/\/$/, '');
  const token = process.env.WATI_API_TOKEN;
  return { baseUrl, token };
}

export function normalizeWhatsapp(phone = '') {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `27${digits.slice(1)}`;
  return digits;
}

/** WhatsApp template params cannot contain newlines/tabs or 4+ consecutive spaces. */
export function sanitizeTemplateParam(value, maxLen = 900) {
  let text = String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`;
  return text;
}

async function watiFetch(baseUrl, token, path, body, method) {
  const httpMethod = method || (body !== undefined ? 'POST' : 'GET');
  const res = await fetch(`${baseUrl}${path}`, {
    method: httpMethod,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text?.slice(0, 500) }; }
  return { ok: res.ok, status: res.status, json };
}

export function parseWatiSendResult({ ok, status, json }) {
  const info = String(json?.info || json?.message || json?.error || '').trim();
  const explicitFail = json?.result === false
    || json?.validWhatsAppNumber === false
    || /undeliverable|invalid phone|not a valid|failed|error/i.test(info);
  if (!ok || explicitFail) {
    return { success: false, error: info || `WATI send failed (${status})`, response: json };
  }
  return { success: true, response: json, messageId: json?.messageId || json?.whatsappMessageId || null };
}

export async function watiEnsureContact(baseUrl, token, phone, name) {
  const { json } = await watiFetch(baseUrl, token, '/api/v1/addContact', {
    name: name || 'Fulfilment',
    phoneNumber: phone,
    allowBroadcast: true,
  });
  return json;
}

export async function watiSendTemplate(baseUrl, token, phone, parameters) {
  const { ok, status, json } = await watiFetch(
    baseUrl,
    token,
    `/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(phone)}`,
    {
      template_name: ORDER_TEMPLATE,
      broadcast_name: ORDER_TEMPLATE,
      parameters,
    },
  );
  return parseWatiSendResult({ ok, status, json });
}

export async function watiSendSessionMessage(baseUrl, token, phone, messageText) {
  const text = String(messageText).slice(0, 4090);
  const query = new URLSearchParams({ messageText: text });
  const { ok, status, json } = await watiFetch(
    baseUrl,
    token,
    `/api/v1/sendSessionMessage/${encodeURIComponent(phone)}?${query.toString()}`,
    undefined,
    'POST',
  );
  const info = String(json?.info || json?.message || json?.error || '').trim();
  const failed = !ok || json?.result === false || json?.ok === false
    || /fail|error|invalid|empty|expired|24.?hour/i.test(info);
  if (failed) {
    return { success: false, error: info || `Session message failed (${status})`, response: json };
  }
  return { success: true, response: json };
}

export function buildSessionOrderMessage({ placedAt, customerName, summary, fulfillmentUrl, orderRef }) {
  const lines = [
    '🛒 *New Proto order*',
    orderRef ? `Ref: ${orderRef}` : null,
    `Time: ${placedAt}`,
    `From: ${customerName}`,
    `Items: ${summary}`,
    `Open: ${fulfillmentUrl}`,
  ].filter(Boolean);
  return lines.join('\n');
}
