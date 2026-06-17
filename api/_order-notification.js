import { requireAuth } from './_auth.js';
import { runOrderTeamNotify } from './_order-notify-core.js';

export function isOrderNotificationAuthorized(req) {
  const secret = process.env.ORDER_NOTIFY_SECRET;
  if (!secret) return false;
  const header = req.headers['x-order-notify-secret'];
  return Boolean(header && header === secret);
}

/** POST handler for team WhatsApp + status advance after an order email. */
export async function handleOrderNotification(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isOrderNotificationAuthorized(req)) {
    const user = await requireAuth(req, res);
    if (!user) return;
  }

  const orderId = String(req.body?.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'orderId is required' });

  try {
    const result = await runOrderTeamNotify(orderId, { emailSent: req.body?.emailSent === true });
    return res.status(200).json(result);
  } catch (err) {
    console.error('order-notification:', err.message);
    return res.status(500).json({ error: err.message || 'Order notification failed' });
  }
}
