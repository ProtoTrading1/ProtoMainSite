import {
  downloadStoredOrderPdf,
  generateAndStoreOrderPdf,
} from '../../_order-pdf.js';
import { verifyOrderToken } from '../../_order-token.js';
import { requireAuth } from '../../_auth.js';
import { getPortalAdminClient } from '../../_site-config.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orderId = String(req.query.orderId || '').trim();
  if (!orderId || !UUID_RE.test(orderId)) {
    return res.status(400).json({ error: 'Valid order id is required' });
  }

  // Access requires either a signed per-order token (WhatsApp/fulfillment links)
  // or an authenticated portal session.
  const token = String(req.query.k || '').trim();
  if (!verifyOrderToken(orderId, token)) {
    const user = await requireAuth(req, res);
    if (!user) return;
    // A valid session is not enough: the order PDF holds full customer PII, so
    // session access is limited to the order's owner or an admin. Without this
    // any logged-in customer could pull another order's PDF by guessing its id.
    const sb = getPortalAdminClient();
    const [{ data: order }, { data: me }] = await Promise.all([
      sb.from('orders').select('customer_id').eq('id', orderId).maybeSingle(),
      sb.from('customers').select('role').eq('id', user.id).maybeSingle(),
    ]);
    const isOwner = order && order.customer_id === user.id;
    const isAdmin = me?.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(404).json({ error: 'Order not found' });
    }
  }

  try {
    let buffer = await downloadStoredOrderPdf(orderId);

    // Not yet stored (e.g. created before this feature, or storage failed at
    // order time) — generate on demand so the WhatsApp button always works.
    if (!buffer) {
      const result = await generateAndStoreOrderPdf(orderId);
      buffer = result.buffer;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="proto-order-${orderId.slice(0, 8)}.pdf"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('order pdf error:', err.message);
    return res.status(404).json({ error: 'Order PDF not available' });
  }
}
