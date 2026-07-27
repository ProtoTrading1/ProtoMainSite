import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
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

const MAX_ORDER_LINES = 250;
const MAX_QTY_PER_LINE = 100000;

async function resolveAuthoritativePrices(items) {
  if (items.length > MAX_ORDER_LINES) {
    const error = new Error(`An order can contain at most ${MAX_ORDER_LINES} product lines.`);
    error.status = 400;
    throw error;
  }

  const skus = [...new Set(items
    .map((i) => String(i.product?.sku || i.product?.id || '').trim().toUpperCase())
    .filter(Boolean))];
  const barcodes = [...new Set(items
    .map((i) => String(i.product?.code || i.product?.barcode || '').trim())
    .filter(Boolean))];
  const productBySku = new Map();
  const productByBarcode = new Map();
  try {
    const sb = getStockClient();
    if (skus.length) {
      const { data, error } = await sb
        .from('website_stock')
        .select('sku, barcode, title, price, image_url_one')
        .in('sku', skus);
      if (error) throw error;
      for (const row of data || []) productBySku.set(String(row.sku).trim().toUpperCase(), row);
    }
    if (barcodes.length) {
      const { data, error } = await sb
        .from('website_stock')
        .select('sku, barcode, title, price, image_url_one')
        .in('barcode', barcodes);
      if (error) throw error;
      for (const row of data || []) {
        if (row.barcode != null) productByBarcode.set(String(row.barcode).trim(), row);
      }
    }
  } catch (err) {
    console.error('send-order: authoritative product lookup failed:', err?.message || err);
    const unavailable = new Error('Current product pricing could not be verified. Please try again.');
    unavailable.status = 503;
    throw unavailable;
  }

  const authItems = items.map((item, index) => {
    const product = item.product || {};
    const sku = String(product.sku || product.id || '').trim().toUpperCase();
    const barcode = String(product.code || product.barcode || '').trim();
    const qty = Number(item.qty);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      const error = new Error(`Invalid quantity on order line ${index + 1}.`);
      error.status = 400;
      throw error;
    }
    const row = productBySku.get(sku) || (barcode ? productByBarcode.get(barcode) : null);
    const price = Number(row?.price);
    if (!row || !Number.isFinite(price) || price < 0) {
      const error = new Error(`Product on order line ${index + 1} is unavailable.`);
      error.status = 400;
      throw error;
    }
    const authoritativeSku = cleanText(row.sku);
    const authoritativeBarcode = cleanText(row.barcode);
    return {
      qty,
      product: {
        id: authoritativeSku,
        sku: authoritativeSku,
        code: authoritativeBarcode,
        barcode: authoritativeBarcode,
        name: cleanText(row.title, authoritativeSku),
        price,
        image: cleanText(row.image_url_one),
        remoteImage: cleanText(row.image_url_one),
      },
    };
  });

  return authItems;
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
      ? `<img src="${escapeHtml(img)}" alt="" width="46" height="46" style="width:46px;height:46px;object-fit:cover;border-radius:8px;background:#f1f5f9;border:1px solid #e5e7eb;display:block;" />`
      : `<div style="width:46px;height:46px;border-radius:8px;background:#f1f5f9;border:1px solid #e5e7eb;"></div>`;
    return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #ececec;color:#94a3b8;font-size:13px;font-weight:700;text-align:center;">${i + 1}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #ececec;">${imgCell}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #ececec;color:#475569;font-size:12px;font-weight:700;white-space:nowrap;">${code}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #ececec;color:#0f172a;font-size:13px;font-weight:600;line-height:1.4;">${name}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #ececec;color:#0f172a;font-size:16px;font-weight:800;text-align:center;">${qty}</td>
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
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>${heading} — Proto Trading</title></head>
<body style="margin:0;padding:0;background:#0b0b0b;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0b;padding:40px 12px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#111111;border-radius:18px;overflow:hidden;border:1px solid #2a2a2a;box-shadow:0 18px 50px rgba(0,0,0,0.55);">
<tr><td style="height:6px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:34px 34px 28px;background:#141414;">
  <div style="display:inline-block;background:#ffffff;padding:13px 20px;border-radius:8px;margin-bottom:22px;">
    <span style="font-size:28px;font-weight:900;color:#c40000;letter-spacing:1px;">PROTO</span>
    <span style="font-size:19px;font-weight:800;color:#222222;letter-spacing:0.5px;"> TRADING</span>
  </div>
  <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.2;font-weight:900;letter-spacing:-0.4px;">${heading}</h1>
  <p style="margin:10px 0 0;color:#cfcfcf;font-size:14px;line-height:1.6;">${subheading}${ref ? ` &nbsp;·&nbsp; <span style="color:#ff6a4d;font-weight:800;">${ref}</span>` : ''}</p>
</td></tr>
<tr><td style="padding:34px 32px 30px;background:#ffffff;">
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
<tr><td align="center" style="padding:28px 34px;background:#181818;border-top:1px solid #292929;">
  <p style="margin:0 0 8px;color:#ffffff;font-size:18px;font-weight:900;">Proto Trading Online</p>
  <p style="margin:0;color:#a9a9a9;font-size:13px;line-height:1.6;">De Roos Street, off Sir Lowry Road, District Six, Cape Town, South Africa</p>
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

/** Persist a verified order. Idempotency is scoped to the authenticated user. */
async function captureOrderRow({ supabase, userId, items, subtotal, deliveryMethod, customerNotes, promo, clientRef }) {
  try {
    if (clientRef) {
      const { data: existing } = await supabase
        .from('orders')
        .select('*')
        .eq('client_ref', clientRef)
        .eq('customer_id', userId)
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
        .eq('customer_id', userId)
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

  const access = await requireApprovedCustomer(req, res);
  if (!access) return;
  const { user } = access;

  if (!process.env.BREVO_API_KEY) {
    return res.status(500).json({ error: 'Brevo API key not configured' });
  }

  const {
    items = [],
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
  const allowedDeliveryMethods = new Set([
    "Customer's own courier",
    'Proto Trading delivers',
    'In store pick up',
  ]);
  if (!allowedDeliveryMethods.has(deliveryMethod)) {
    return res.status(400).json({ error: 'Delivery method is required' });
  }
  if (customerNotes.length > 2000) {
    return res.status(400).json({ error: 'Customer notes are too long.' });
  }
  const clientRef = cleanText(rawClientRef);
  if (!/^(?:[0-9a-f]{8}-[0-9a-f-]{27}|ref-[A-Za-z0-9-]{12,80})$/i.test(clientRef)) {
    return res.status(400).json({ error: 'Invalid checkout reference.' });
  }

  let orderItems;
  try {
    orderItems = await resolveAuthoritativePrices(items);
  } catch (err) {
    return res.status(err?.status || 500).json({ error: err?.message || 'Order items could not be verified.' });
  }
  const subtotal = computeSubtotal(orderItems);
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

  const portal = getPortalAdminClient();
  const { data: profile, error: profileError } = await portal
    .from('customers')
    .select('*')
    .eq('id', user.id)
    .single();
  if (profileError || !profile) {
    console.error('send-order: customer profile lookup failed:', profileError?.message);
    return res.status(503).json({ error: 'Your customer profile could not be verified. Please try again.' });
  }
  const customer = {
    name: cleanText(profile.name || profile.business_name, 'Trade customer'),
    email: cleanText(user.email),
    phone: cleanText(profile.phone),
    region: cleanText(
      profile.delivery_address
      || [profile.city, profile.province, profile.country].filter(Boolean).join(', '),
      'To confirm',
    ),
  };

  const captured = await captureOrderRow({
    supabase: portal,
    userId: user.id,
    items: orderItems,
    subtotal,
    deliveryMethod,
    customerNotes,
    promo,
    clientRef,
  });
  if (!captured?.id) {
    return res.status(500).json({
      error: 'Your order could not be submitted. Nothing was lost from your cart — please try again.',
    });
  }
  const orderId = String(captured.id);
  const orderNumber = cleanText(captured.order_number);

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
        replyTo: customer.email ? { email: customer.email } : undefined,
        subject: `Proto Trading Quote Request - ${cleanText(customer.name, 'Trade customer')}`,
        htmlContent: buildOrderEmailHtml({ audience: 'team', orderNumber, customer, items: orderItems, totals, deliveryMethod, customerNotes, promo }),
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
    orderId,
    dbCaptureFailed: false,
    emailDeliveryFailed,
    emailFailReason: emailDeliveryFailed ? emailFailReason : null,
    notify: notifyResult,
    notifyWarning: notifyResult && !notifyResult.ok
      ? notifyResult.statusBlockedReason || 'WhatsApp team notification did not reach everyone'
      : null,
  });
}
