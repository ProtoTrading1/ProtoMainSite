import { hasCustomerUsedPromo, validatePromoCode } from './_promo-codes.js';
import { getPortalAdminClient } from './_site-config.js';
import { requireAuth } from './_auth.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Promo validation reveals which codes are live (and their discount) — gate it
  // behind a session and throttle it so the code space can't be brute-forced.
  const user = await requireAuth(req, res);
  if (!user) return;

  const rl = await checkRateLimit({
    bucket: `validate-promo:${user.id}:${clientIp(req)}`,
    max: 20,
    windowSeconds: 300,
  });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60));
    return res.status(429).json({ valid: false, error: 'Too many attempts. Please wait a moment.' });
  }

  const { code, subtotal } = req.body || {};
  try {
    const result = await validatePromoCode(code, subtotal);
    if (!result.valid) {
      return res.status(200).json({ valid: false, error: result.error });
    }
    // One redemption per customer — tell them in the cart, not at submit.
    if (await hasCustomerUsedPromo(getPortalAdminClient(), user.id, result.code)) {
      return res.status(200).json({ valid: false, error: 'This promo code has already been used on a previous order.' });
    }
    return res.status(200).json({
      valid: true,
      code: result.code,
      discountPct: result.discountPct,
      discountAmount: result.discountAmount,
      subtotal: result.subtotal,
      total: result.total,
    });
  } catch (err) {
    console.error('validate-promo error:', err.message);
    return res.status(500).json({ valid: false, error: 'Could not verify promo code. Try again.' });
  }
}
