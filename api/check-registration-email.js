import { checkRateLimit, clientIp } from './_rate-limit.js';
import { validateEmail } from './register-trade.js';

export function createRegistrationEmailCheckHandler({ rateLimit = checkRateLimit } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const emailCheck = validateEmail(req.body?.email);
    if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });
    const limit = await rateLimit({ bucket: `registration-email-check:${clientIp(req)}`, max: 60, windowSeconds: 3600 });
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfter || 60));
      return res.status(429).json({ error: 'Too many email checks. Please try again later.' });
    }
    const emailLimit = await rateLimit({ bucket: `registration-email-check-email:${emailCheck.email}`, max: 10, windowSeconds: 3600 });
    if (!emailLimit.allowed) {
      res.setHeader('Retry-After', String(emailLimit.retryAfter || 60));
      return res.status(429).json({ error: 'Too many email checks. Please try again later.' });
    }
    // Syntax/domain policy only: no customer or Auth account lookup.
    return res.status(200).json({ ok: true, validationOnly: true });
  };
}
export default createRegistrationEmailCheckHandler();
