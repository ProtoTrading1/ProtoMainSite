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

// Email 5 — customer acknowledgement sent the moment an order is placed.
// Confirms receipt; the team follows up with confirmed stock/pricing/delivery.
function buildCustomerAckHtml({ customer, itemCount }) {
  const name = escapeHtml(cleanText(customer?.name, 'there'));
  const lines = itemCount
    ? `<p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">We have received your order (${itemCount} item${itemCount === 1 ? '' : 's'}) and our team will be in touch shortly to confirm stock, pricing and delivery.</p>`
    : `<p style="margin:0 0 18px;color:#444444;font-size:16px;line-height:1.7;">We have received your order and our team will be in touch shortly to confirm stock, pricing and delivery.</p>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>We received your order</title></head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:40px 12px;"><tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#111111;border-radius:18px;overflow:hidden;border:1px solid #2a2a2a;box-shadow:0 18px 50px rgba(0,0,0,0.55);">
<tr><td style="height:6px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:38px 34px 30px;background:#141414;">
  <div style="display:inline-block;background:#ffffff;padding:14px 22px;border-radius:8px;margin-bottom:26px;">
    <span style="font-size:30px;font-weight:900;color:#c40000;letter-spacing:1px;">PROTO</span>
    <span style="font-size:20px;font-weight:800;color:#222222;letter-spacing:0.5px;"> TRADING</span>
  </div>
  <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.2;font-weight:900;letter-spacing:-0.4px;">Order received</h1>
  <p style="margin:12px 0 0;color:#cfcfcf;font-size:15px;line-height:1.6;">Thank you — we're on it</p>
</td></tr>
<tr><td style="padding:42px 38px 34px;background:#ffffff;">
  <p style="margin:0 0 18px;color:#111111;font-size:18px;line-height:1.6;font-weight:700;">Hi ${name},</p>
  ${lines}
  <p style="margin:0;color:#666666;font-size:13px;line-height:1.6;">Questions in the meantime? Contact us at <a href="mailto:online@proto.co.za" style="color:#c40000;">online@proto.co.za</a> or call <a href="tel:+27214615883" style="color:#c40000;">+27 21 461 5883</a>.</p>
</td></tr>
<tr><td align="center" style="padding:30px 34px;background:#181818;border-top:1px solid #292929;">
  <p style="margin:0 0 8px;color:#ffffff;font-size:18px;font-weight:900;">Proto Trading Online</p>
  <p style="margin:0;color:#a9a9a9;font-size:13px;line-height:1.6;">De Roos Street, off Sir Lowry Road, District Six, Cape Town, South Africa</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendCustomerOrderAck({ customer, itemCount, toEmail }) {
  // Recipient is the AUTHENTICATED account email, never the client-supplied
  // customer.email — otherwise a logged-in user could make Proto's Brevo send
  // "order received" mail to any address they type. Name is cosmetic only.
  const to = cleanText(toEmail);
  if (!to || !to.includes('@')) return;
  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online',
          email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
        },
        to: [{ email: to, name: cleanText(customer?.name) || to }],
        subject: 'We have received your order — Proto Trading Online',
        htmlContent: buildCustomerAckHtml({ customer, itemCount }),
      }),
      // Bounded so a hung Brevo connection can't stall the order response.
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      console.error('send-order: customer ack email error:', resp.status, JSON.stringify(body));
    }
  } catch (err) {
    console.error('send-order: customer ack email failed:', err?.message || err);
  }
}

function isMissingClientRefColumn(error) {
  const msg = String(error?.message || '');
  return (error?.code === 'PGRST204' || error?.code === '42703' || /column|schema/i.test(msg))
    && msg.includes('client_ref');
}

/**
 * Server-side order capture — the failsafe for P0-2. Runs when the browser
 * insert failed or was skipped (no orderId in the payload), using the verified
 * auth user's id as customer_id (customers.id === auth user id). Idempotent on
 * client_ref (migration 030), so a retried checkout can never double-insert.
 * Returns the order row or null; never throws.
 */
async function captureOrderRow({ supabase, userId, items, subtotal, deliveryMethod, customerNotes, promo, clientRef }) {
  try {
    if (clientRef) {
      const { data: existing } = await supabase
        .from('orders')
        .select('*')
        .eq('client_ref', clientRef)
        .maybeSingle();
      if (existing) return existing;
    }

    const rows = items.map((item) => {
      const product = item.product || {};
      const qty = Number(item.qty || 0);
      const unitPrice = Number(product.price || 0);
      return {
        productId: product.id,
        code: product.code,
        name: product.name,
        qty,
        unitPrice,
        lineTotal: unitPrice * qty,
        image: product.remoteImage || product.image || '',
      };
    });

    let insertRow = {
      customer_id: userId,
      items: rows,
      original_items: rows,
      final_items: rows,
      order_match: 'order-match',
      total_ex_vat: subtotal,
      delivery_method: deliveryMethod,
      ...(customerNotes ? { customer_notes: customerNotes } : {}),
      ...(promo?.code ? {
        promo_code: promo.code,
        discount_pct: promo.discountPct,
        discount_amount: promo.discountAmount,
      } : {}),
      ...(clientRef ? { client_ref: clientRef } : {}),
    };

    let { data, error } = await supabase.from('orders').insert([insertRow]).select().single();
    if (error && isMissingClientRefColumn(error)) {
      const withoutRef = { ...insertRow };
      delete withoutRef.client_ref;
      insertRow = withoutRef;
      ({ data, error } = await supabase.from('orders').insert([insertRow]).select().single());
    }
    if (error && error.code === '23505' && clientRef) {
      const { data: existing } = await supabase
        .from('orders')
        .select('*')
        .eq('client_ref', clientRef)
        .maybeSingle();
      if (existing) return existing;
    }
    if (error) {
      console.error('send-order: server-side order capture failed:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('send-order: server-side order capture failed:', err?.message || err);
    return null;
  }
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
    clientRef: rawClientRef,
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

  // Failsafe: if the browser insert didn't land (no orderId), capture the order
  // here with the service-role client before anything is emailed. If even this
  // fails, the team email below becomes the dead-letter and is flagged loudly.
  let orderId = String(rawOrderId || '').trim();
  let dbCaptureFailed = false;
  if (!orderId) {
    const captured = await captureOrderRow({
      supabase: getPortalAdminClient(),
      userId: user.id,
      items,
      subtotal,
      deliveryMethod,
      customerNotes,
      promo,
      clientRef: cleanText(rawClientRef),
    });
    if (captured?.id) {
      orderId = String(captured.id);
    } else {
      dbCaptureFailed = true;
    }
  }

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
        subject: dbCaptureFailed
          ? `⚠️ MANUAL CAPTURE NEEDED — Proto Trading Quote Request - ${cleanText(customer.name, 'Trade customer')}`
          : `Proto Trading Quote Request - ${cleanText(customer.name, 'Trade customer')}`,
        htmlContent: (dbCaptureFailed
          ? '<div style="background:#c40000;color:#ffffff;padding:16px 20px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;">⚠️ DATABASE CAPTURE FAILED — this order exists only in this email. Capture it manually in the admin portal, then investigate the orders insert failure in the logs.</div>'
          : '') + buildEmailHtml({ items, customer, totals, deliveryMethod, customerNotes, promo }),
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

  // Both capture channels lost: no DB row AND no team email. The order does not
  // exist anywhere durable, so this must surface as a failure — the customer
  // keeps their cart and can retry (the clientRef makes the retry idempotent).
  if (dbCaptureFailed && emailDeliveryFailed) {
    return res.status(500).json({
      error: 'Your order could not be submitted. Nothing was lost from your cart — please try again.',
    });
  }

  // Email 5 — acknowledge the customer (to their verified account email) after
  // all order-critical work. Best-effort + bounded, so it never blocks/fails
  // the order.
  await sendCustomerOrderAck({ customer, itemCount: items.length, toEmail: user?.email });

  return res.status(200).json({
    success: true,
    orderId: orderId || null,
    dbCaptureFailed,
    emailDeliveryFailed,
    emailFailReason: emailDeliveryFailed ? emailFailReason : null,
    notify: notifyResult,
    notifyWarning: notifyResult && !notifyResult.ok
      ? notifyResult.statusBlockedReason || 'WhatsApp team notification did not reach everyone'
      : null,
  });
}
