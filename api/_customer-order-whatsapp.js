// Customer WhatsApp is intentionally isolated from the internal order-notify
// workflow. That workflow is email/PDF only and must never send to customers.
// This preview helper is transport-injected for tests and defaults closed.

function cleanText(value, fallback = '') {
  const text = String(value || '').replace(/[<>]/g, '').trim();
  return text || fallback;
}

function normalisePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return `27${digits.slice(1)}`;
  if (digits.startsWith('27') && digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

export function buildCustomerOrderWhatsappAcknowledgement({ customer, orderNumber } = {}) {
  if (customer?.accept_whatsapp !== true) return { ok: false, reason: 'not-opted-in' };
  const phone = normalisePhone(customer?.phone);
  if (!phone) return { ok: false, reason: 'invalid-phone' };
  const firstName = cleanText(customer?.name, 'there').split(/\s+/)[0];
  const safeOrderNumber = cleanText(orderNumber);
  if (!safeOrderNumber) return { ok: false, reason: 'missing-order-number' };
  return {
    ok: true,
    recipient: phone,
    // Keep a transactional acknowledgement minimal: no delivery address,
    // items, prices, notes, promotion or payment claim.
    message: `Hi ${firstName}, we have received your order request ${safeOrderNumber}. We are checking stock, final pricing and delivery.`,
  };
}

export async function sendCustomerOrderWhatsappAcknowledgement(input, {
  enabled = false,
  transport = null,
} = {}) {
  const payload = buildCustomerOrderWhatsappAcknowledgement(input);
  if (!payload.ok) return { sent: false, ...payload };
  // Closed by default. A later production release requires an atomic
  // one-per-order claim plus an approved provider template before enabling.
  if (!enabled || typeof transport !== 'function') return { sent: false, reason: 'not-configured', recipient: payload.recipient };
  try {
    const result = await transport(payload);
    return { sent: Boolean(result?.sent), recipient: payload.recipient, providerStatus: result?.providerStatus ?? null };
  } catch (error) {
    return { sent: false, recipient: payload.recipient, reason: 'transport-failed', error: error?.message || 'Transport failed' };
  }
}
