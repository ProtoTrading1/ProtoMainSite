import {
  downloadStoredOrderPdf,
  generateAndStoreOrderPdf,
} from '../../_order-pdf.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orderId = String(req.query.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'Order id is required' });

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
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Length', buffer.length);
    return res.status(200).send(buffer);
  } catch (err) {
    console.error('order pdf error:', err.message);
    return res.status(404).json({ error: 'Order PDF not available' });
  }
}
