import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Dependency-free primitives for HMAC reset tokens (no Supabase imports), so the
 * crypto core is unit-testable in isolation. Token format: `<payload>.<sig>`
 * where payload is base64url JSON and sig is HMAC-SHA256(payload).
 */

export function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Sign a set of claims. `exp` is derived from ttlMs at signing time. */
export function signResetToken(claims, secret, ttlMs) {
  const payload = Buffer.from(JSON.stringify({
    ...claims,
    email: String(claims.email || '').trim().toLowerCase(),
    v: Number(claims.v) || 0,
    exp: Date.now() + ttlMs,
  })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * Verify signature and expiry only. Returns the decoded claims object. Callers
 * layer on email-format / version checks. Uses a constant-time compare so the
 * signature check does not leak via timing.
 */
export function verifyResetTokenRaw(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid or expired reset link.');
  const [payload, sig] = parts;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!timingSafeEqualStr(sig, expected)) throw new Error('Invalid or expired reset link.');
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    throw new Error('Invalid or expired reset link.');
  }
  if (Date.now() > Number(data.exp || 0)) throw new Error('Reset link has expired. Please request a new one.');
  return data;
}
