import PDFDocument from 'pdfkit';
import { requireAuth } from './_auth.js';
import { runOrderTeamNotify } from './_order-notify-core.js';
import { escapeHtml } from './_escape-html.js';
import { getPortalAdminClient } from './_site-config.js';
import { validatePromoCode } from './_promo-codes.js';

const DEFAULT_NOTIFY_EMAILS = ['online@proto.co.za', 'danieljoffeinfo@gmail.com'];

function resolveOrderNotifyRecipients() {
  const raw = process.env.ORDER_NOTIFY_EMAILS || process.env.ORDER_TO_EMAIL || '';
  const emails = raw
    ? raw.split(',').map((part) => part.trim()).filter(Boolean)
    : DEFAULT_NOTIFY_EMAILS;
  return [...new Set(emails)];
}

function money(value) {
  return `R${Number(value || 0).toFixed(2)}`;
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function isPdfKitImage(url = '') {
  return /\.(png|jpe?g)(\?.*)?$/i.test(url);
}

const ALLOWED_IMAGE_HOSTS = [
  process.env.VITE_SUPABASE_URL ? new URL(process.env.VITE_SUPABASE_URL).host : null,
  process.env.VITE_STOCK_SUPABASE_URL ? new URL(process.env.VITE_STOCK_SUPABASE_URL).host : null,
].filter(Boolean);

async function fetchImageBuffer(url) {
  if (!url || !isPdfKitImage(url)) return null;
  try {
    const parsed = new URL(url);
    if (!['https:'].includes(parsed.protocol)) return null;
    if (!ALLOWED_IMAGE_HOSTS.some((host) => parsed.host === host)) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function prepareItems(items) {
  return Promise.all(items.map(async (item) => {
    const product = item.product || {};
    const imageUrl = product.remoteImage || product.image || '';
    return {
      ...item,
      product: {
        ...product,
        imageBuffer: await fetchImageBuffer(imageUrl),
      },
    };
  }));
}

function computeSubtotal(items) {
  return items.reduce((sum, item) => {
    const product = item.product || {};
    return sum + Number(product.price || 0) * Number(item.qty || 0);
  }, 0);
}

function estimatedTotal(subtotal, discountAmount) {
  return Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100);
}

function buildPdfBuffer({ items, customer, totals, deliveryMethod, customerNotes, promo }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(22).fillColor('#111827').text('PROTO TRADING');
    doc.font('Helvetica').fontSize(10).fillColor('#dc2626').text('Wholesale order request', { continued: false });
    doc.moveDown(0.8);

    doc.fontSize(9).fillColor('#64748b');
    doc.text(`Date: ${new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}`);
    doc.text('All prices incl. VAT. Stock and delivery are confirmed by reply.');
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Customer details');
    doc.font('Helvetica').fontSize(10).fillColor('#334155');
    doc.text(`Name: ${cleanText(customer?.name, 'Not provided')}`);
    doc.text(`Email: ${cleanText(customer?.email, 'Not provided')}`);
    doc.text(`Phone: ${cleanText(customer?.phone, 'Not provided')}`);
    doc.text(`Delivery region: ${cleanText(customer?.region, 'To confirm')}`);
    if (deliveryMethod) doc.text(`Delivery method: ${cleanText(deliveryMethod)}`);
    if (customerNotes) doc.text(`Customer notes: ${cleanText(customerNotes)}`);
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Order items');
    doc.moveDown(0.5);

    items.forEach((item, index) => {
      const product = item.product || {};
      const qty = Number(item.qty || 0);
      const price = Number(product.price || 0);
      const lineTotal = qty * price;
      const y = doc.y;

      doc.roundedRect(42, y, 511, 78, 8).strokeColor('#e5e7eb').lineWidth(1).stroke();
      if (product.imageBuffer) {
        try {
          doc.image(product.imageBuffer, 54, y + 10, { fit: [54, 54], align: 'center', valign: 'center' });
        } catch {
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8').text('IMAGE', 62, y + 32);
        }
      } else {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#94a3b8').text('IMAGE', 62, y + 32);
      }
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b').text(`${index + 1}. ${cleanText(product.code, 'NO CODE')}`, 122, y + 12);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(cleanText(product.name, 'Unnamed product'), 122, y + 28, { width: 250 });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(`Qty: ${qty}`, 390, y + 18);
      doc.text(`Unit: ${money(price)}`, 390, y + 32);
      doc.font('Helvetica-Bold').fillColor('#111827').text(`Total: ${money(lineTotal)}`, 390, y + 48);
      doc.y = y + 92;

      if (doc.y > 720 && index < items.length - 1) doc.addPage();
    });

    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text(`Subtotal incl. VAT: ${money(totals?.subtotal)}`, { align: 'right' });
    if (promo?.code) {
      doc.font('Helvetica').fontSize(11).fillColor('#64748b').text(`Promo (${promo.code}, ${promo.discountPct}%): -${money(promo.discountAmount)}`, { align: 'right' });
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#111827').text(`Est. total incl. VAT: ${money(totals?.total)}`, { align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Estimated discount — final pricing confirmed by reply.', { align: 'right' });
    }
    doc.moveDown(1.2);
    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Please confirm stock availability, wholesale pricing and delivery estimate by reply.');
    doc.end();
  });
}

function buildEmailHtml({ items, customer, totals, deliveryMethod, customerNotes, promo }) {
  const rows = items.map((item) => {
    const product = item.product || {};
    const qty = Number(item.qty || 0);
    const price = Number(product.price || 0);
    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(cleanText(product.code))}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(cleanText(product.name))}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${qty}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${money(price * qty)}</td>
      </tr>
    `;
  }).join('');

  const deliveryLine = deliveryMethod
    ? `<strong>Delivery method:</strong> ${escapeHtml(cleanText(deliveryMethod))}<br/>`
    : '';
  const notesLine = customerNotes
    ? `<strong>Customer notes:</strong> ${escapeHtml(cleanText(customerNotes))}<br/>`
    : '';

  const promoLines = promo?.code
    ? `<p style="font-size:14px;color:#64748b;">Promo <strong>${escapeHtml(promo.code)}</strong> (${promo.discountPct}%): -${money(promo.discountAmount)}<br/>
      <strong style="font-size:16px;color:#111827;">Est. total incl. VAT: ${money(totals?.total)}</strong><br/>
      <span style="font-size:12px;">Estimated discount — final pricing confirmed by reply.</span></p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;">
      <h2>Proto Trading wholesale order request</h2>
      <p>A customer submitted a quote request through the trade portal. The PDF order request is attached.</p>
      <p><strong>Customer:</strong> ${escapeHtml(cleanText(customer?.name, 'Not provided'))}<br/>
      <strong>Email:</strong> ${escapeHtml(cleanText(customer?.email, 'Not provided'))}<br/>
      <strong>Phone:</strong> ${escapeHtml(cleanText(customer?.phone, 'Not provided'))}<br/>
      <strong>Delivery region:</strong> ${escapeHtml(cleanText(customer?.region, 'To confirm'))}<br/>
      ${deliveryLine}${notesLine}</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb;">Code</th>
            <th style="text-align:left;padding:10px;border-bottom:2px solid #e5e7eb;">Product</th>
            <th style="text-align:right;padding:10px;border-bottom:2px solid #e5e7eb;">Qty</th>
            <th style="text-align:right;padding:10px;border-bottom:2px solid #e5e7eb;">Line total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="font-size:16px;"><strong>Subtotal incl. VAT: ${money(totals?.subtotal)}</strong></p>
      ${promoLines}
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Brevo API key not configured' });
  }

  const {
    items = [],
    customer = {},
    orderId: rawOrderId,
    deliveryMethod: rawDeliveryMethod,
    customerNotes: rawCustomerNotes,
    promoCode: rawPromoCode,
  } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No order items supplied' });
  }

  const deliveryMethod = cleanText(rawDeliveryMethod);
  const customerNotes = cleanText(rawCustomerNotes);
  if (!deliveryMethod) {
    return res.status(400).json({ error: 'Delivery method is required' });
  }

  const subtotal = computeSubtotal(items);
  let promo = null;
  const promoCode = cleanText(rawPromoCode).toUpperCase();
  if (promoCode) {
    const promoResult = await validatePromoCode(promoCode, subtotal);
    if (!promoResult.valid) {
      return res.status(400).json({ error: promoResult.error || 'Invalid promo code.' });
    }
    promo = {
      code: promoResult.code,
      discountPct: promoResult.discountPct,
      discountAmount: promoResult.discountAmount,
    };
  }

  const totals = {
    subtotal,
    discountAmount: promo?.discountAmount || 0,
    total: promo ? estimatedTotal(subtotal, promo.discountAmount) : subtotal,
  };

  const notifyEmails = resolveOrderNotifyRecipients();

  // PDF generation must never block the order email. pdfkit can fail on
  // serverless (e.g. missing AFM font data); if it does, log the real error and
  // still send the email — without the attachment — so the team is notified.
  let pdfBuffer = null;
  try {
    const preparedItems = await prepareItems(items);
    pdfBuffer = await buildPdfBuffer({
      items: preparedItems,
      customer,
      totals,
      deliveryMethod,
      customerNotes,
      promo,
    });
  } catch (err) {
    console.error('send-order: PDF generation failed:', err?.stack || err?.message || err);
  }

  const attachment = pdfBuffer
    ? [{ name: `proto-order-${Date.now()}.pdf`, content: pdfBuffer.toString('base64') }]
    : undefined;

  let emailDeliveryFailed = false;
  let emailFailReason = null;
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
          name: process.env.BREVO_SENDER_NAME || 'Proto Trading Portal',
          email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
        },
        to: notifyEmails.map((email) => ({ email })),
        replyTo: customer.email ? { email: cleanText(customer.email) } : undefined,
        subject: `Proto Trading Quote Request - ${cleanText(customer.name, 'Trade customer')}`,
        htmlContent: buildEmailHtml({ items, customer, totals, deliveryMethod, customerNotes, promo }),
        attachment,
      }),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const msg = body.message || `Brevo ${resp.status}`;
      console.error('Brevo API error:', resp.status, JSON.stringify(body));
      emailDeliveryFailed = true;
      emailFailReason = msg;
    }
  } catch (err) {
    console.error('Brevo fetch error:', err?.stack || err?.message || err);
    emailDeliveryFailed = true;
    emailFailReason = err?.message || 'Network error';
  }

  const orderId = String(rawOrderId || '').trim();
  let notifyResult = null;
  if (orderId) {
    try {
      const supabase = getPortalAdminClient();
      const patch = {
        delivery_method: deliveryMethod,
        ...(customerNotes ? { customer_notes: customerNotes } : {}),
        ...(promo?.code ? {
          promo_code: promo.code,
          discount_pct: promo.discountPct,
          discount_amount: promo.discountAmount,
        } : {}),
      };
      const { error: patchErr } = await supabase.from('orders').update(patch).eq('id', orderId);
      if (patchErr) console.error('send-order: delivery/notes update failed:', patchErr.message);
    } catch (err) {
      console.error('send-order: delivery/notes update failed:', err.message);
    }

    try {
      notifyResult = await runOrderTeamNotify(orderId, { emailSent: !emailDeliveryFailed });
    } catch (err) {
      console.error('send-order: team notify failed:', err.message);
    }

    // Premium tier upgrade — recomputed server-side from the stored order row,
    // never from client-sent totals.
    try {
      const supabase = getPortalAdminClient();
      const { data: order } = await supabase
        .from('orders')
        .select('customer_id, items')
        .eq('id', orderId)
        .maybeSingle();
      const orderItems = Array.isArray(order?.items) ? order.items : [];
      const serverTotal = orderItems.reduce(
        (sum, it) => sum + Number(it.unitPrice || 0) * Number(it.qty || 0),
        0,
      );
      const qualifies = serverTotal > 4000 && orderItems.some((it) => Number(it.qty || 0) > 10);
      if (qualifies && order?.customer_id) {
        await supabase
          .from('customers')
          .update({ tier: 'premium' })
          .eq('id', order.customer_id)
          .eq('tier', 'regular');
      }
    } catch (err) {
      console.error('send-order: premium tier check failed:', err.message);
    }
  }

  return res.status(200).json({
    success: true,
    orderId: orderId || null,
    emailDeliveryFailed,
    emailFailReason: emailDeliveryFailed ? emailFailReason : null,
    notify: notifyResult,
    notifyWarning: notifyResult && !notifyResult.ok
      ? notifyResult.statusBlockedReason || 'WhatsApp team notification did not reach everyone'
      : null,
  });
}
