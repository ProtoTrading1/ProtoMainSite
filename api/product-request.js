export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { description, qty, imageBase64, imageName, imageType, customerEmail, customerName } = req.body || {};

  if (!description || !imageBase64) {
    return res.status(400).json({ error: 'Description and image are required.' });
  }

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Email service not configured.' });
  }

  const bodyHtml = `
    <h2>New Product Request</h2>
    <p><strong>From:</strong> ${customerName || 'Unknown'} (${customerEmail || 'No email'})</p>
    <p><strong>Description:</strong> ${description}</p>
    ${qty ? `<p><strong>Quantity needed:</strong> ${qty}</p>` : ''}
    <p><em>Reference image attached.</em></p>
  `;

  const attachment = [{
    content: imageBase64,
    name: imageName || 'reference-image.jpg',
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
        replyTo: customerEmail ? { email: customerEmail } : undefined,
        subject: `Product Request — ${description.slice(0, 60)}`,
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
