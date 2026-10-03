import { checkRateLimit, clientIp } from './_rate-limit.js';
import { tradeEmailClient, sendTradeVerificationEmail } from './_trade-email-verification.js';

export function createResendTradeVerificationHandler({ rateLimit = checkRateLimit, client = tradeEmailClient, send = sendTradeVerificationEmail } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).end();
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
    const limits = await Promise.all([
      rateLimit({ bucket: `trade-resend-ip:${clientIp(req)}`, max: 10, windowSeconds: 3600 }),
      rateLimit({ bucket: `trade-resend-email:${email}`, max: 3, windowSeconds: 3600 }),
    ]);
    if (limits.some((limit) => !limit.allowed)) return res.status(429).json({ error: 'Please wait before requesting another confirmation email.' });
    try {
      const service = client();
      const { data: profile, error } = await service.from('customers')
        .select('id, name, email, trade_email_verification_required, trade_email_verified_at').eq('email', email).maybeSingle();
      if (error) throw error;
      if (profile?.trade_email_verification_required && !profile.trade_email_verified_at) {
        await send({ client: service, userId: profile.id, email: profile.email, name: profile.name });
      }
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(503).json({ error: 'Confirmation email is unavailable. Please try again later.' });
    }
  };
}
export default createResendTradeVerificationHandler();
