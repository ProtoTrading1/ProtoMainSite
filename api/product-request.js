import { escapeHtml } from './_escape-html.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import { requireApprovedCustomer } from './_auth.js';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } },
};

const MAX_IMAGE_BASE64 = 7 * 1024 * 1024; // ~5MB decoded
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function detectedImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export function validateImagePayload(imageBase64, claimedType) {
  const encoded = String(imageBase64 || '').trim();
  if (!encoded || encoded.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    return { ok: false, error: 'Image is invalid or too large.' };
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
    return { ok: false, error: 'Image is invalid or too large.' };
  }
  const detectedType = detectedImageType(buffer);
  if (!detectedType || (claimedType && detectedType !== String(claimedType).toLowerCase())) {
    return { ok: false, error: 'The uploaded file is not a valid JPG, PNG, WEBP or GIF image.' };
  }
  return { ok: true, detectedType };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const access = await requireApprovedCustomer(req, res);
  if (!access) return;

  // This sends an email with a multi-MB attachment, so keep both an account and
  // IP limit even though only approved trade customers may call it.
  const rl = await checkRateLimit({
    bucket: `product-request:${access.user.id}:${clientIp(req)}`,
    max: 5,
    windowSeconds: 600,
  });
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter || 60));
    return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
  }

  const { description, qty, imageBase64, imageName, imageType } = req.body || {};

  if (!description || !imageBase64) {
    return res.status(400).json({ error: 'Description and image are required.' });
  }

  if (String(description).length > 2000) {
    return res.status(400).json({ error: 'Description is too long.' });
  }

  if (imageType && !ALLOWED_IMAGE_TYPES.has(String(imageType).toLowerCase())) {
    return res.status(400).json({ error: 'Only JPG, PNG, WEBP or GIF images are accepted.' });
  }
  const imageCheck = validateImagePayload(imageBase64, imageType);
  if (!imageCheck.ok) return res.status(400).json({ error: imageCheck.error });

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured.' });
  }

  const safeName = escapeHtml(access.customer.name || access.customer.business_name, 'Trade customer');
  const safeEmail = escapeHtml(access.user.email, 'No email');
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
        replyTo: access.user.email ? { email: access.user.email } : undefined,
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
