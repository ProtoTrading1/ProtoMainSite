import {
  findUserByEmail,
  getResetSecret,
  getResetTokenVersion,
  getServiceClient,
  verifyResetToken,
} from './_password-reset.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';

const INVALID_LINK = { valid: false, error: 'This reset link is invalid, expired, or has already been used. Request a new one.' };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const token = String(req.body?.token || '');
  if (!token) return res.status(400).json(INVALID_LINK);

  const secret = getResetSecret();
  if (!secret) return res.status(500).json({ valid: false, error: 'Password reset is temporarily unavailable.' });

  const limit = await checkRateLimit({
    bucket: `reset-validate:ip:${clientIp(req)}`,
    max: 30,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    if (limit.retryAfter) res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ valid: false, error: 'Too many attempts. Please wait and try again.' });
  }

  try {
    const claim = verifyResetToken(token, secret);
    const user = await findUserByEmail(getServiceClient(), claim.email);
    if (!user || getResetTokenVersion(user) !== claim.v) {
      return res.status(400).json(INVALID_LINK);
    }
    return res.status(200).json({ valid: true });
  } catch {
    return res.status(400).json(INVALID_LINK);
  }
}
