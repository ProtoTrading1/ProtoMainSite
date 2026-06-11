import { requireAuth } from './_auth.js';
import { runOrderTeamNotify } from './_order-notify-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const orderId = String(req.body?.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  try {
    const result = await runOrderTeamNotify(orderId, { emailSent: req.body?.emailSent === true });
    return res.status(200).json(result);
  } catch (err) {
    console.error('order-notify:', err.message);
    return res.status(500).json({ error: err.message || 'Order notify failed' });
  }
}
