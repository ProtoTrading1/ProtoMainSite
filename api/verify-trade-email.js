import { checkRateLimit, clientIp } from './_rate-limit.js';
import { tradeEmailClient, tradeTokenClient, verifyTradeEmail } from './_trade-email-verification.js';

export function createVerifyTradeEmailHandler({ rateLimit = checkRateLimit, serviceClient = tradeEmailClient, tokenClient = tradeTokenClient } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).end();
    const limit = await rateLimit({ bucket: `trade-verify:${clientIp(req)}`, max: 20, windowSeconds: 3600 });
    if (!limit.allowed) return res.status(429).json({ error: 'Too many confirmation attempts. Please try again later.' });
    try {
      return res.status(200).json(await verifyTradeEmail({ tokenHash: req.body?.tokenHash, serviceClient: serviceClient(), verifyClient: tokenClient() }));
    } catch (error) {
      // Provider errors/tokens/session data are deliberately not logged.
      return res.status(error.status || 503).json({ error: error.status ? error.message : 'Email confirmation is unavailable. Please try again later.' });
    }
  };
}
export default createVerifyTradeEmailHandler();
