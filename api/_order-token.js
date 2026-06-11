import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed per-order access tokens. Keep in sync with protoportal-admin/api/_admin-auth.js.
 * Secret is ORDER_NOTIFY_SECRET (already shared between both Vercel projects).
 *
 * Tokens are 12 hex chars (48 bits) — enough for short-lived per-order URLs that
 * an attacker would also have to guess a random UUID for. Verify still accepts
 * the legacy 32-char tokens so old WhatsApp messages keep working.
 */
const TOKEN_LEN = 12;
const LEGACY_TOKEN_LEN = 32;

function fullDigest(orderId) {
  const secret = process.env.ORDER_NOTIFY_SECRET;
  if (!secret) return '';
  return createHmac('sha256', secret).update(`order:${String(orderId).trim()}`).digest('hex');
}

export function orderToken(orderId) {
  const hex = fullDigest(orderId);
  return hex ? hex.slice(0, TOKEN_LEN) : '';
}

export function verifyOrderToken(orderId, token) {
  if (!orderId || !token) return false;
  const provided = String(token);
  const len = provided.length;
  if (len !== TOKEN_LEN && len !== LEGACY_TOKEN_LEN) return false;
  const hex = fullDigest(orderId);
  if (!hex) return false;
  const expected = hex.slice(0, len);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
