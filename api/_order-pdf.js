import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import { getPortalAdminClient, SITE_CONFIG_BUCKET } from './_site-config.js';

export const ORDER_PDF_PREFIX = 'orders';

function getStockClient() {
  const url = process.env.VITE_STOCK_SUPABASE_URL;
  const key = process.env.VITE_STOCK_SUPABASE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

export function formatPlacedAt(value) {
  const date = value ? new Date(value) : new Date();
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date).replace(/\u202f/g, ' ');
  } catch {
    return date.toISOString();
  }
}

export function orderItems(order) {
  const final = Array.isArray(order?.final_items) ? order.final_items : [];
  const base = Array.isArray(order?.items) ? order.items : [];
  return (final.length ? final : base).filter(Boolean);
}

export function buildOrderSummary(items, { maxItems = 12, maxChars = 760 } = {}) {
  const parts = items
    .filter((it) => !it.removed)
    .map((it) => `${Number(it.finalQty ?? it.qty ?? 0)}x ${cleanText(it.name, it.code || 'Item')}`);
  if (!parts.length) return 'No items';
  let summary = parts.slice(0, maxItems).join(', ');
  const remaining = parts.length - maxItems;
  if (remaining > 0) summary += `, +${remaining} more`;
  if (summary.length > maxChars) summary = `${summary.slice(0, maxChars - 1)}…`;
  return summary;
}

export async function loadOrderForPdf(orderId) {
  const supabase = getPortalAdminClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('*, customers(name, email, phone, business_name, business_type, city, province, country)')
    .eq('id', orderId)
    .single();
  if (error || !order) throw new Error('Order not found');

  const customer = order.customers || {};
  const items = orderItems(order);

  const skus = [...new Set(items.map((it) => it.productId).filter(Boolean))];
  const categoryMap = {};
  if (skus.length) {
    const stock = getStockClient();
    if (stock) {
      try {
        const { data } = await stock.from('website_stock').select('sku, category').in('sku', skus);
        (data || []).forEach((row) => {
          categoryMap[row.sku] = cleanText(row.category, 'Other') || 'Other';
        });
      } catch { /* category enrichment is best-effort */ }
    }
  }

  return { order, customer, items, categoryMap };
}

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const COL = { num: 40, code: 66, name: 150, category: 372, qty: 500 };
const ROW_BOTTOM_LIMIT = PAGE.height - 70;
const FOOTER_Y = PAGE.height - PAGE.margin - 12;

function drawTableHeader(doc, y) {
  doc.rect(PAGE.margin, y, PAGE.width - PAGE.margin * 2, 22).fill('#0f172a');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  doc.text('#', COL.num + 4, y + 7, { width: COL.code - COL.num - 6 });
  doc.text('Code', COL.code, y + 7, { width: COL.name - COL.code - 6 });
  doc.text('Product', COL.name, y + 7, { width: COL.category - COL.name - 6 });
  doc.text('Category', COL.category, y + 7, { width: COL.qty - COL.category - 6 });
  doc.text('Qty', COL.qty, y + 7, { width: PAGE.width - PAGE.margin - COL.qty, align: 'right' });
  return y + 22;
}

export function buildOrderPdfBuffer({ order, customer, items, categoryMap = {} }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const orderNumber = cleanText(order.order_number, order.id?.slice(0, 8) || '');
    const placedAt = formatPlacedAt(order.created_at);
    const contentWidth = PAGE.width - PAGE.margin * 2;

    // ── Header band ──────────────────────────────────────────────
    doc.rect(0, 0, PAGE.width, 92).fill('#0f172a');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('PROTO TRADING', PAGE.margin, 26);
    doc.font('Helvetica').fontSize(11).fillColor('#f87171').text('Order Fulfilment Sheet', PAGE.margin, 56);

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
      .text(`Order ${orderNumber}`, PAGE.margin, 28, { align: 'right', width: contentWidth });
    doc.font('Helvetica').fontSize(9).fillColor('#cbd5e1')
      .text(placedAt, PAGE.margin, 46, { align: 'right', width: contentWidth });
    doc.fontSize(8).fillColor('#94a3b8')
      .text(`Ref: ${order.id}`, PAGE.margin, 62, { align: 'right', width: contentWidth });

    // ── Customer block ───────────────────────────────────────────
    let y = 116;
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Customer', PAGE.margin, y);
    y += 18;
    doc.font('Helvetica').fontSize(10).fillColor('#334155');

    const name = cleanText(customer.name, 'Not provided');
    const business = cleanText(customer.business_name, '');
    const email = cleanText(customer.email, 'Not provided');
    const phone = cleanText(customer.phone, 'Not provided');
    const location = [customer.city, customer.province, customer.country].map((v) => cleanText(v)).filter(Boolean).join(', ');

    doc.text(`Name: ${name}`, PAGE.margin, y); y += 14;
    if (business) { doc.text(`Business: ${business}`, PAGE.margin, y); y += 14; }
    doc.text(`Email: ${email}`, PAGE.margin, y); y += 14;
    doc.text(`Phone: ${phone}`, PAGE.margin, y); y += 14;
    if (location) { doc.text(`Location: ${location}`, PAGE.margin, y); y += 14; }
    const deliveryMethod = cleanText(order.delivery_method, '');
    if (deliveryMethod) { doc.text(`Delivery: ${deliveryMethod}`, PAGE.margin, y); y += 14; }
    const customerNotes = cleanText(order.customer_notes, '');
    if (customerNotes) {
      doc.font('Helvetica-Bold').text('Customer notes:', PAGE.margin, y); y += 14;
      doc.font('Helvetica').text(customerNotes, PAGE.margin, y, { width: contentWidth }); 
      y += doc.heightOfString(customerNotes, { width: contentWidth }) + 8;
    }
    doc.text(`Placed: ${placedAt}`, PAGE.margin, y); y += 22;

    // ── Items table ──────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a').text('Order items', PAGE.margin, y);
    y += 18;
    y = drawTableHeader(doc, y);

    const visible = items.filter((it) => !it.removed);
    visible.forEach((item, index) => {
      const code = cleanText(item.code, '—');
      const productName = cleanText(item.name, 'Unnamed product');
      const category = cleanText(categoryMap[item.productId], 'Other') || 'Other';
      const qty = String(Number(item.finalQty ?? item.qty ?? 0));

      const nameWidth = COL.category - COL.name - 6;
      doc.font('Helvetica-Bold').fontSize(9);
      const nameHeight = doc.heightOfString(productName, { width: nameWidth });
      const rowHeight = Math.max(20, nameHeight + 8);

      if (y + rowHeight > ROW_BOTTOM_LIMIT) {
        doc.addPage();
        y = PAGE.margin + 10;
        y = drawTableHeader(doc, y);
      }

      if (index % 2 === 1) {
        doc.rect(PAGE.margin, y, contentWidth, rowHeight).fill('#f8fafc');
        doc.fillColor('#111827');
      }

      const textY = y + 5;
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(String(index + 1), COL.num + 4, textY, { width: COL.code - COL.num - 6 });
      doc.fillColor('#111827').text(code, COL.code, textY, { width: COL.name - COL.code - 6 });
      doc.font('Helvetica-Bold').text(productName, COL.name, textY, { width: nameWidth });
      doc.font('Helvetica').fillColor('#475569').text(category, COL.category, textY, { width: COL.qty - COL.category - 6 });
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(qty, COL.qty, textY, { width: PAGE.width - PAGE.margin - COL.qty, align: 'right' });

      y += rowHeight;
      doc.moveTo(PAGE.margin, y).lineTo(PAGE.width - PAGE.margin, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    });

    y += 14;
    const totalUnits = visible.reduce((sum, it) => sum + Number(it.finalQty ?? it.qty ?? 0), 0);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a')
      .text(`${visible.length} line item${visible.length === 1 ? '' : 's'} · ${totalUnits} unit${totalUnits === 1 ? '' : 's'}`, PAGE.margin, y, {
        align: 'right',
        width: contentWidth,
      });

    // ── Footer on every page (buffered-pages pattern avoids recursion) ──
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
        .text('Powered by Apollo', PAGE.margin, FOOTER_Y, {
          align: 'center',
          width: contentWidth,
          lineBreak: false,
        });
    }

    doc.flushPages();
    doc.end();
  });
}

export async function storeOrderPdf(orderId, buffer) {
  const supabase = getPortalAdminClient();
  const { error } = await supabase.storage
    .from(SITE_CONFIG_BUCKET)
    .upload(`${ORDER_PDF_PREFIX}/${orderId}.pdf`, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (error) throw new Error(error.message);
}

export async function downloadStoredOrderPdf(orderId) {
  const supabase = getPortalAdminClient();
  const { data, error } = await supabase.storage
    .from(SITE_CONFIG_BUCKET)
    .download(`${ORDER_PDF_PREFIX}/${orderId}.pdf`);
  if (error || !data) return null;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateAndStoreOrderPdf(orderId) {
  const context = await loadOrderForPdf(orderId);
  const buffer = await buildOrderPdfBuffer(context);
  await storeOrderPdf(orderId, buffer);
  return { ...context, buffer };
}
