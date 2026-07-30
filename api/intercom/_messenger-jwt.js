import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HS256 signing for Intercom Messenger identity JWTs.
 *
 * Kept separate from the handler (mirroring api/_reset-token.js) so the crypto
 * is unit-testable without a Supabase session. Uses node:crypto rather than a
 * jsonwebtoken dependency — HS256 is three base64url segments and an HMAC, and
 * this keeps the serverless bundle dependency-free.
 *
 * Intercom requires `user_id`; `email` is what the Fin catalogue data connector
 * reads, and it is only trusted because it arrives inside this signature.
 */

export const DEFAULT_TTL_SECONDS = 12 * 60 * 60;
export const MAX_TTL_SECONDS = 24 * 60 * 60;

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function hmac(signingInput, secret) {
  return createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function resolveTtlSeconds(raw, fallback = DEFAULT_TTL_SECONDS) {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, MAX_TTL_SECONDS);
}

/**
 * @param {{ userId: string, email: string, name?: string|null, ttlSeconds?: number, now?: number }} claims
 * @param {string} secret Intercom Messenger API secret
 * @returns {string} signed HS256 JWT
 */
export function signMessengerJwt({ userId, email, name = null, ttlSeconds, now } = {}, secret) {
  if (!secret) throw new Error('Messenger secret is required');
  if (!userId) throw new Error('userId is required');
  if (!email) throw new Error('email is required');

  const issuedAt = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);
  const ttl = resolveTtlSeconds(ttlSeconds);

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    user_id: userId,
    email,
    ...(name ? { name } : {}),
    iat: issuedAt,
    exp: issuedAt + ttl,
  }));

  const signingInput = `${header}.${payload}`;
  return `${signingInput}.${hmac(signingInput, secret)}`;
}

/**
 * Verify + decode. Exists for tests and local debugging; Intercom does the real
 * verification. Returns null on any tampering or expiry.
 */
export function verifyMessengerJwt(token, secret, { now } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = hmac(`${header}.${payload}`, secret);
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const at = Number.isFinite(now) ? now : Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp <= at) return null;
  return claims;
}
