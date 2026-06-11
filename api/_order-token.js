import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed per-order access tokens. Keep in sync with protoportal-admin/api/_admin-auth.js.
 * Secret is ORDER_NOTIFY_SECRET (already shared between both Vercel projects).
 */
export function orderToken(orderId) {
  const secret = process.env.ORDER_NOTIFY_SECRET;
  if (!secret) return '';
  return createHmac('sha256', secret).update(`order:${String(orderId).trim()}`).digest('hex').slice(0, 32);
}

export function verifyOrderToken(orderId, token) {
  const expected = orderToken(orderId);
  if (!expected || !token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
