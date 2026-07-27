import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import { requireAuth } from './_auth.js';
import { runOrderTeamNotify } from './_order-notify-core.js';
import { escapeHtml } from './_escape-html.js';
import { getPortalAdminClient } from './_site-config.js';
import { validatePromoCode } from './_promo-codes.js';

const DEFAULT_NOTIFY_EMAILS = ['george@proto.co.za', 'online@proto.co.za', 'danieljoffeinfo@gmail.com'];

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

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Resolve authoritative unit prices from website_stock (Stock DB), keyed by sku
 * with a barcode fallback, so promo eligibility and stored totals don't trust
 * the client-supplied product.price.
 *
 * Returns:
 *  - authItems: items with product.price replaced by the server price when the
 *    product was found (client price kept otherwise, so a rare unlisted item
 *    still shows a sane estimate the team confirms).
 *  - gateSubtotal: sum over ONLY server-priced items — used for the promo
 *    minimum-order check so a client can't inflate a price (or invent a sku) to
 *    clear a minOrder threshold.
 *  - resolved: false if the Stock DB lookup errored, so the caller can fall back
 *    to the client subtotal for the gate rather than block a legitimate promo.
 */
async function resolveAuthoritativePrices(items) {
  const skus = [...new Set(items
    .map((i) => String(i.product?.sku || i.product?.id || '').trim().toUpperCase())
    .filter(Boolean))];
  const barcodes = [...new Set(items
    .map((i) => String(i.product?.code || i.product?.barcode || '').trim())
    .filter(Boolean))];
  const priceBySku = new Map();
  const priceByBarcode = new Map();
  let resolved = true;
  try {
    const sb = getStockClient();
    if (skus.length) {
      const { data, error } = await sb.from('website_stock').select('sku, price').in('sku', skus);
      if (error) throw error;
      for (const r of data || []) priceBySku.set(String(r.sku).trim().toUpperCase(), Number(r.price) || 0);
    }
    if (barcodes.length) {
      const { data, error } = await sb.from('website_stock').select('barcode, price').in('barcode', barcodes);
      if (error) throw error;
      for (const r of data || []) {
        if (r.barcode != null) priceByBarcode.set(String(r.barcode).trim(), Number(r.price) || 0);
      }
    }
  } catch (err) {
    console.error('send-order: authoritative price lookup failed, using client prices:', err?.message || err);
    resolved = false;
  }

  let gateSubtotal = 0;
  const authItems = items.map((item) => {
    const product = item.product || {};
    const sku = String(product.sku || product.id || '').trim().toUpperCase();
    const barcode = String(product.code || product.barcode || '').trim();
    const qty = Number(item.qty || 0);
    let serverPrice;
    if (priceBySku.has(sku)) serverPrice = priceBySku.get(sku);
    else if (barcode && priceByBarcode.has(barcode)) serverPrice = priceByBarcode.get(barcode);
    if (serverPrice != null) {
      gateSubtotal += serverPrice * qty;
      return { ...item, product: { ...product, price: serverPrice } };
    }
    return item;
  });

  return { authItems, gateSubtotal, resolved };
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

function orderDateLabel(value) {
  const d = value ? new Date(value) : new Date();
  try {
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// Product table rows shared by both order emails. Mirrors the packing slip:
// #, image, code, product, qty.
function buildOrderEmailRows(items) {
  return items.map((item, i) => {
    const product = item.product || {};
    const qty = Number(item.qty || 0);
    const code = escapeHtml(cleanText(product.code, '—'));
    const name = escapeHtml(cleanText(product.name, 'Product'));
    const img = cleanText(product.image || product.remoteImage || '');
    const imgCell = /^https:\/\//i.test(img)
      ? `<img src="${escapeHtml(img)}" alt="" width="92" height="92" style="width:92px;height:92px;object-fit:cover;border-radius:8px;background:#f1f5f9;border:1px solid #e5e7eb;display:block;" />`
      : `<div style="width:92px;height:92px;border-radius:8px;background:#f1f5f9;border:1px solid #e5e7eb;"></div>`;
    // Force a page break after every 10th line so a printout never crams more
    // than 10 items onto a page (rows also never split across a page).
    const pageBreak = ((i + 1) % 10 === 0 && i + 1 < items.length) ? ' ord-break' : '';
    return `
      <tr class="ord-row${pageBreak}">
        <td style="padding:14px 10px;border-bottom:1px solid #ececec;color:#94a3b8;font-size:14px;font-weight:700;text-align:center;">${i + 1}</td>
        <td style="padding:14px 10px;border-bottom:1px solid #ececec;">${imgCell}</td>
        <td style="padding:14px 10px;border-bottom:1px solid #ececec;color:#475569;font-size:12px;font-weight:700;white-space:nowrap;">${code}</td>
        <td style="padding:14px 10px;border-bottom:1px solid #ececec;color:#0f172a;font-size:14px;font-weight:600;line-height:1.4;">${name}</td>
        <td style="padding:14px 10px;border-bottom:1px solid #ececec;color:#0f172a;font-size:17px;font-weight:800;text-align:center;">${qty}</td>
      </tr>`;
  }).join('');
}

// Single dark, PROTO-branded order email used for BOTH the internal team
// notification and the customer acknowledgement. Structured like the packing
// slip: order meta header, contact/delivery, product table, note, estimate.
function buildOrderEmailHtml({
  audience = 'team',
  orderNumber,
  orderDate,
  customer,
  deliveryMethod,
  customerNotes,
  items = [],
  totals,
  promo,
}) {
  const isTeam = audience === 'team';
  const name = escapeHtml(cleanText(customer?.name, 'there'));
  const rows = buildOrderEmailRows(items);
  const itemCount = items.length;
  const ref = escapeHtml(cleanText(orderNumber, ''));
  const dateLabel = escapeHtml(orderDateLabel(orderDate));
  const delivery = escapeHtml(cleanText(deliveryMethod, 'To confirm'));

  const heading = isTeam ? 'New wholesale order' : 'Order received';
  const subheading = isTeam ? 'Straight from the trade portal' : "Thank you — we're on it";

  const metaCell = (label, value) => `
    <td style="padding:0 8px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:3px;">${label}</div>
      <div style="font-size:14px;font-weight:800;color:#0f172a;">${value}</div>
    </td>`;

  const metaRow = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse;background:#f8fafc;border:1px solid #eef2f7;border-radius:12px;">
      <tr>
        ${ref ? metaCell('Order', ref) : ''}
        ${metaCell('Order date', dateLabel)}
        ${metaCell('Shipping', delivery)}
      </tr>
    </table>`;

  const intro = isTeam
    ? `<p style="margin:0 0 22px;color:#334155;font-size:15px;line-height:1.6;">A new quote request just came in through the trade portal. The order-request PDF is attached. Customer, delivery and line items are below.</p>`
    : `<p style="margin:0 0 6px;color:#0f172a;font-size:18px;line-height:1.6;font-weight:800;">Hi ${name},</p>
       <p style="margin:0 0 22px;color:#334155;font-size:15px;line-height:1.6;">We've received your order${itemCount ? ` (${itemCount} item${itemCount === 1 ? '' : 's'})` : ''}. Our team will be in touch shortly to confirm stock, pricing and delivery. Here's your summary:</p>`;

  const contactBlock = isTeam
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
        <tr>
          <td style="vertical-align:top;padding-right:10px;width:50%;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">Customer</div>
            <div style="font-size:14px;font-weight:800;color:#0f172a;line-height:1.5;">${escapeHtml(cleanText(customer?.name, 'Not provided'))}</div>
            <div style="font-size:13px;color:#475569;line-height:1.6;">${escapeHtml(cleanText(customer?.email, 'No email'))}<br/>${escapeHtml(cleanText(customer?.phone, 'No phone'))}</div>
          </td>
          <td style="vertical-align:top;padding-left:10px;width:50%;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">Delivery</div>
            <div style="font-size:14px;font-weight:800;color:#0f172a;line-height:1.5;">${delivery}</div>
            <div style="font-size:13px;color:#475569;line-height:1.6;">${escapeHtml(cleanText(customer?.region, 'Region to confirm'))}</div>
          </td>
        </tr>
      </table>`
    : '';

  const notesBlock = customerNotes
    ? `<div style="margin:22px 0 0;padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#c2410c;margin-bottom:4px;">Note from customer</div>
        <div style="font-size:14px;color:#7c2d12;line-height:1.5;">${escapeHtml(cleanText(customerNotes))}</div>
      </div>`
    : '';

  const promoLine = promo?.code
    ? `<tr><td style="padding:2px 0;color:#15803d;font-size:13px;">Promo <strong>${escapeHtml(promo.code)}</strong>${promo.discountPct ? ` (${promo.discountPct}%)` : ''}</td><td style="padding:2px 0;text-align:right;color:#15803d;font-size:13px;font-weight:700;">−${money(promo.discountAmount)}</td></tr>`
    : '';
  const totalsBlock = `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;">
      <tr><td style="padding:2px 0;color:#475569;font-size:13px;">Subtotal (incl. VAT)</td><td style="padding:2px 0;text-align:right;color:#0f172a;font-size:13px;font-weight:700;">${money(totals?.subtotal)}</td></tr>
      ${promoLine}
      <tr><td style="padding:8px 0 0;color:#0f172a;font-size:15px;font-weight:800;">Estimated total</td><td style="padding:8px 0 0;text-align:right;color:#c40000;font-size:18px;font-weight:900;">${money(totals?.total ?? totals?.subtotal)}</td></tr>
    </table>
    <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;line-height:1.5;">Estimated only — final pricing, stock and delivery are confirmed by our team on reply.</p>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${heading} — Proto Trading</title>
<style>
  @media print {
    html, body { background:#ffffff !important; }
    .ord-shell { padding:0 !important; background:#ffffff !important; }
    .ord-card { box-shadow:none !important; border:none !important; border-radius:0 !important; }
    tr.ord-row { page-break-inside: avoid; }
    tr.ord-break { page-break-after: always; }
    thead { display: table-header-group; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" class="ord-shell" style="background:#f4f4f5;padding:32px 12px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" class="ord-card" style="width:100%;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 6px 24px rgba(15,23,42,0.08);">
<tr><td style="height:6px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 34px 22px;background:#ffffff;border-bottom:1px solid #eef2f7;">
  <div style="margin-bottom:14px;">
    <span style="font-size:28px;font-weight:900;color:#c40000;letter-spacing:1px;">PROTO</span>
    <span style="font-size:20px;font-weight:800;color:#0f172a;letter-spacing:0.5px;"> TRADING</span>
  </div>
  <h1 style="margin:0;color:#0f172a;font-size:26px;line-height:1.2;font-weight:900;letter-spacing:-0.4px;">${heading}</h1>
  <p style="margin:8px 0 0;color:#64748b;font-size:14px;line-height:1.6;">${subheading}${ref ? ` &nbsp;·&nbsp; <span style="color:#c40000;font-weight:800;">${ref}</span>` : ''}</p>
</td></tr>
<tr><td style="padding:30px 32px 28px;background:#ffffff;">
  ${intro}
  ${metaRow}
  ${contactBlock}
  <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <thead>
      <tr>
        <th style="text-align:center;padding:0 10px 10px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #ececec;">#</th>
        <th style="text-align:left;padding:0 10px 10px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #ececec;">Image</th>
        <th style="text-align:left;padding:0 10px 10px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #ececec;">Code</th>
        <th style="text-align:left;padding:0 10px 10px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #ececec;">Product</th>
        <th style="text-align:center;padding:0 10px 10px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #ececec;">Qty</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${totalsBlock}
  ${notesBlock}
  <p style="margin:26px 0 0;color:#666666;font-size:13px;line-height:1.6;">Questions? Contact us at <a href="mailto:online@proto.co.za" style="color:#c40000;">online@proto.co.za</a> or call <a href="tel:+27214615883" style="color:#c40000;">+27 21 461 5883</a>.</p>
</td></tr>
<tr><td align="center" style="padding:22px 34px;background:#ffffff;border-top:1px solid #eef2f7;">
  <p style="margin:0 0 6px;color:#0f172a;font-size:17px;font-weight:900;">Proto Trading Online</p>
  <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">De Roos Street, off Sir Lowry Road, District Six, Cape Town, South Africa</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function sendCustomerOrderAck({ customer, toEmail, orderNumber, items, totals, deliveryMethod, customerNotes, promo }) {
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
        subject: orderNumber
          ? `Order received ${orderNumber} — Proto Trading Online`
          : 'We have received your order — Proto Trading Online',
        htmlContent: buildOrderEmailHtml({
          audience: 'customer',
          orderNumber,
          customer,
          items: Array.isArray(items) ? items : [],
          totals,
          deliveryMethod,
          customerNotes,
          promo,
        }),
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
    if (error && error.code === '23503') {
      // Foreign-key violation: no customers row for this auth user — the exact
      // "missing profile" case this failsafe exists for. customer_id is
      // nullable, so persist the order unlinked rather than losing it entirely.
      console.warn('send-order: no customer profile for user, capturing order unlinked:', userId);
      insertRow = { ...insertRow, customer_id: null };
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

  // Prices are re-derived from the Stock DB — never trusted from the client — so
  // the promo minimum-order gate and the stored totals can't be gamed by sending
  // an inflated product.price.
  const { authItems: orderItems, gateSubtotal, resolved: pricesResolved } = await resolveAuthoritativePrices(items);
  const subtotal = computeSubtotal(orderItems);
  // Gate the promo on authoritative prices when we could resolve them; if the
  // Stock DB was unreachable, fall back to the client subtotal so a legitimate
  // promo isn't blocked by an outage.
  const promoGateSubtotal = pricesResolved ? gateSubtotal : subtotal;
  let promo = null;
  const promoCode = cleanText(rawPromoCode).toUpperCase();
  if (promoCode) {
    const promoResult = await validatePromoCode(promoCode, promoGateSubtotal);
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
  let orderNumber = '';
  let dbCaptureFailed = false;
  if (orderId) {
    // A client-supplied order id MUST belong to the caller. The update/notify/
    // tier block below uses the service-role client (which bypasses RLS), so
    // without this check any authenticated user could point send-order at
    // another customer's order and overwrite its fields or re-notify the team
    // (IDOR). Orders always carry customer_id = auth uid (see captureOrderRow /
    // saveOrder); a 404 avoids leaking whether the id exists.
    const { data: owner } = await getPortalAdminClient()
      .from('orders')
      .select('customer_id, order_number')
      .eq('id', orderId)
      .maybeSingle();
    if (!owner || owner.customer_id !== user.id) {
      return res.status(404).json({ error: 'Order not found' });
    }
    orderNumber = cleanText(owner.order_number);
  } else {
    const captured = await captureOrderRow({
      supabase: getPortalAdminClient(),
      userId: user.id,
      items: orderItems,
      subtotal,
      deliveryMethod,
      customerNotes,
      promo,
      clientRef: cleanText(rawClientRef),
    });
    if (captured?.id) {
      orderId = String(captured.id);
      orderNumber = cleanText(captured.order_number);
    } else {
      dbCaptureFailed = true;
    }
  }

  // PDF generation must never block the order email. pdfkit can fail on
  // serverless (e.g. missing AFM font data); if it does, log the real error and
  // still send the email — without the attachment — so the team is notified.
  let pdfBuffer = null;
  try {
    const preparedItems = await prepareItems(orderItems);
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
          : '') + buildOrderEmailHtml({ audience: 'team', orderNumber, customer, items: orderItems, totals, deliveryMethod, customerNotes, promo }),
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
  await sendCustomerOrderAck({
    customer,
    toEmail: user?.email,
    orderNumber,
    items: orderItems,
    totals,
    deliveryMethod,
    customerNotes,
    promo,
  });

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
