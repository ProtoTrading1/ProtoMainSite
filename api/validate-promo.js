import { validatePromoCode } from './_promo-codes.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, subtotal } = req.body || {};
  try {
    const result = await validatePromoCode(code, subtotal);
    if (!result.valid) {
      return res.status(200).json({ valid: false, error: result.error });
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
