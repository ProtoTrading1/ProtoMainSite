import { requireApprovedCustomer } from '../_auth.js';
import { checkRateLimit } from '../_rate-limit.js';
import { resolveTtlSeconds, signMessengerJwt } from './_messenger-jwt.js';

/**
 * Issues a signed Intercom Messenger JWT for the logged-in customer.
 *
 * This is what makes Fin's catalogue lookup safe to expose. Intercom only treats
 * a contact's email as *verified* when it arrives inside a JWT signed with the
 * workspace's Messenger secret. Because this endpoint sits behind
 * `requireApprovedCustomer`, a verified Intercom identity now implies an
 * approved Proto Trading trade account — so the price/stock data connector can
 * trust the email it is handed instead of taking the customer's word for it.
 *
 * The email is read from the Supabase session server-side and is never accepted
 * from the request body or query. That is the whole point: a client-supplied
 * email is exactly the spoofable input this removes.
 *
 * Env:
 *   INTERCOM_MESSENGER_SECRET  Intercom > Settings > Workspace > Security > Messenger
 *   INTERCOM_JWT_TTL_SECONDS   optional, default 43200 (12h), capped at 24h
 */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.INTERCOM_MESSENGER_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'INTERCOM_MESSENGER_SECRET is not configured on this deployment' });
  }

  // Sends its own 401 (not signed in) or 403 (not an approved trade account).
  const auth = await requireApprovedCustomer(req, res);
  if (!auth) return;
  const { user, customer } = auth;

  if (!user.email) {
    return res.status(409).json({ error: 'Account has no email address' });
  }

  const limit = await checkRateLimit({
    bucket: `intercom-jwt:${user.id}`,
    max: 30,
    windowSeconds: 300,
  });
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfter ?? 60));
    return res.status(429).json({ error: 'Too many requests' });
  }

  const ttlSeconds = resolveTtlSeconds(process.env.INTERCOM_JWT_TTL_SECONDS);

  try {
    const token = signMessengerJwt({
      userId: user.id,
      email: user.email,
      name: customer.name || customer.business_name || null,
      ttlSeconds,
    }, secret);

    return res.status(200).json({ token, expires_in: ttlSeconds });
  } catch (err) {
    console.error('intercom messenger jwt error:', err?.message || err);
    return res.status(500).json({ error: 'Could not issue Intercom identity token' });
  }
}
