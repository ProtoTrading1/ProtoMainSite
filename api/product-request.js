import { escapeHtml } from './_escape-html.js';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

const MAX_IMAGE_BASE64 = 7 * 1024 * 1024; // ~5MB decoded
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { description, qty, imageBase64, imageName, imageType, customerEmail, customerName } = req.body || {};

  if (!description || !imageBase64) {
    return res.status(400).json({ error: 'Description and image are required.' });
  }

  if (String(description).length > 2000) {
    return res.status(400).json({ error: 'Description is too long.' });
  }

  if (String(imageBase64).length > MAX_IMAGE_BASE64) {
    return res.status(400).json({ error: 'Image is too large — please use an image under 5MB.' });
  }

  if (imageType && !ALLOWED_IMAGE_TYPES.has(String(imageType).toLowerCase())) {
    return res.status(400).json({ error: 'Only JPG, PNG, WEBP or GIF images are accepted.' });
  }

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured.' });
  }

  const safeName = escapeHtml(customerName, 'Unknown');
  const safeEmail = escapeHtml(customerEmail, 'No email');
  const safeDescription = escapeHtml(description);
  const safeQty = escapeHtml(qty);

  const bodyHtml = `
    <h2>New Product Request</h2>
    <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
    <p><strong>Description:</strong> ${safeDescription}</p>
    ${qty ? `<p><strong>Quantity needed:</strong> ${safeQty}</p>` : ''}
    <p><em>Reference image attached.</em></p>
  `;

  const safeAttachmentName = String(imageName || 'reference-image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const attachment = [{
    content: imageBase64,
    name: safeAttachmentName,
  }];

  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'Proto Portal',
          email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
        },
        to: [{ email: process.env.ORDER_TO_EMAIL || 'online@proto.co.za', name: 'Proto Trading' }],
        replyTo: customerEmail ? { email: String(customerEmail).trim() } : undefined,
        subject: `Product Request — ${String(description).slice(0, 60)}`,
        htmlContent: bodyHtml,
        attachment,
      }),
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      console.error('Brevo product-request error:', resp.status, JSON.stringify(body));
      return res.status(500).json({ error: 'Failed to send request.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('product-request error:', err.message);
    return res.status(500).json({ error: 'Failed to send request.' });
  }
}
