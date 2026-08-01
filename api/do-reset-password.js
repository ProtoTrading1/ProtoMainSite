import { createHash } from 'crypto';
import {
  consumeResetToken,
  findUserByEmail,
  getResetSecret,
  getResetTokenVersion,
  getServiceClient,
  revokeUserSessions,
  verifyResetToken,
} from './_password-reset.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import { passwordPolicyError } from '../src/lib/passwordPolicy.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  const passwordError = passwordPolicyError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  const secret = getResetSecret();
  if (!secret) return res.status(500).json({ error: 'Server misconfigured' });

  // Throttle brute-forcing of the token endpoint (per IP, fixed 1h window).
  const ip = clientIp(req);
  const ipLimit = await checkRateLimit({ bucket: `reset-do:ip:${ip}`, max: 20, windowSeconds: 3600 });
  if (!ipLimit.allowed) {
    if (ipLimit.retryAfter) res.setHeader('Retry-After', String(ipLimit.retryAfter));
    return res.status(429).json({ error: 'Too many attempts. Please wait and try again.' });
  }

  let claim;
  try {
    claim = verifyResetToken(token, secret); // { email, v }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const supabase = getServiceClient();
    const user = await findUserByEmail(supabase, claim.email);
    // Generic message whether or not the account exists — no enumeration oracle.
    if (!user) return res.status(400).json({ error: 'This reset link is no longer valid.' });

    // Single-use: the link carries the token version at issue time. A completed
    // reset (or a newer link) bumps it, so a replayed or superseded link fails.
    if (getResetTokenVersion(user) !== claim.v) {
      return res.status(400).json({ error: 'This reset link has already been used or replaced. Request a new one.' });
    }

    // A unique insert in migration 060 is the compare-and-swap boundary. Only
    // one concurrent redemption of this signed token can proceed.
    const tokenHash = createHash('sha256').update(String(token)).digest('hex');
    const consumed = await consumeResetToken(supabase, tokenHash, user.id, claim.exp);
    if (!consumed) {
      return res.status(400).json({ error: 'This reset link has already been used or replaced. Request a new one.' });
    }

    // Revoke before changing the password and fail closed if the security RPC
    // is unavailable. The customer is never told every device was signed out
    // unless the existing GoTrue sessions were actually deleted.
    await revokeUserSessions(supabase, user.id);

    // Atomic single-use: rotate the password AND bump reset_token_version in the
    // SAME write, so a partial failure can never leave the link replayable (a
    // separate bump could fail after the password changed, keeping the link
    // valid for the rest of its TTL).
    const nextVersion = getResetTokenVersion(user) + 1;
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { ...(user.app_metadata || {}), reset_token_version: nextVersion },
    });
    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('do-reset-password:', err.message);
    return res.status(500).json({ error: 'Password reset failed' });
  }
}
