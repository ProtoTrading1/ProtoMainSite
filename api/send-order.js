import PDFDocument from 'pdfkit';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
import { resolveOrderNotifyRecipients } from './_order-email-recipients.js';
import { runOrderTeamNotify } from './_order-notify-core.js';
import { generateAndStoreOrderPdf } from './_order-pdf.js';
import { escapeHtml } from './_escape-html.js';
import { getPortalAdminClient } from './_site-config.js';
import { validatePromoCode } from './_promo-codes.js';

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
    // Bounded: a slow/hung image host must never hold the checkout function
    // open. Without the image the PDF simply renders that line without a thumb.
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
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

const ORDER_PDF_PAGE = { width: 595.28, height: 841.89, margin: 30 };
const ORDER_PDF_ROW_HEIGHT = 68;
const ORDER_PDF_CONTINUATION_LIMIT = 9;
const ORDER_PDF_COL = {
  number: 30,
  image: 45,
  code: 115,
  product: 190,
  qty: 365,
  unit: 398,
  total: 452,
  added: 521,
};

export function paginateOrderItems(itemCount, firstPageLimit = 9) {
  const count = Math.max(0, Number(itemCount) || 0);
  const firstLimit = Math.max(1, Math.min(9, Number(firstPageLimit) || 9));
  if (count <= firstLimit) return [count];

  const sizes = [firstLimit];
  let remaining = count - firstLimit;
  while (remaining > 0) {
    const size = Math.min(ORDER_PDF_CONTINUATION_LIMIT, remaining);
    sizes.push(size);
    remaining -= size;
  }

  // Avoid a continuation page containing only one item while still keeping
  // earlier pages usefully full.
  if (sizes.length > 1 && sizes.at(-1) === 1 && sizes.at(-2) > 2) {
    sizes[sizes.length - 2] -= 1;
    sizes[sizes.length - 1] = 2;
  }
  return sizes;
}

function drawInternalPdfLogo(doc) {
  const logoPath = path.join(process.cwd(), 'public', 'proto-trading-online-email.png');
  try {
    doc.image(logoPath, ORDER_PDF_PAGE.margin, 18, {
      fit: [178, 49],
      align: 'left',
      valign: 'center',
    });
  } catch {
    doc.rect(ORDER_PDF_PAGE.margin, 18, 178, 49).fill('#000000');
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff')
      .text('PROTO ', ORDER_PDF_PAGE.margin + 12, 33, { continued: true });
    doc.fillColor('#e02020').text('TRADING');
  }
}

function drawInternalPdfColumnHeader(doc, y) {
  const right = ORDER_PDF_PAGE.width - ORDER_PDF_PAGE.margin;
  doc.rect(ORDER_PDF_PAGE.margin, y, right - ORDER_PDF_PAGE.margin, 21).fill('#f8fafc');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b');
  doc.text('#', ORDER_PDF_COL.number + 4, y + 7, { width: 14 });
  doc.text('IMAGE', ORDER_PDF_COL.image + 3, y + 7, { width: 52 });
  doc.text('CODE', ORDER_PDF_COL.code, y + 7, { width: 68 });
  doc.text('PRODUCT', ORDER_PDF_COL.product, y + 7, { width: 170 });
  doc.text('QTY', ORDER_PDF_COL.qty, y + 7, { width: 27, align: 'center' });
  doc.text('UNIT PRICE', ORDER_PDF_COL.unit - 5, y + 7, { width: 50, align: 'right' });
  doc.text('TOTAL', ORDER_PDF_COL.total, y + 7, { width: 54, align: 'right' });
  doc.text('ADDED', ORDER_PDF_COL.added, y + 7, { width: 48, align: 'center' });
  doc.moveTo(ORDER_PDF_PAGE.margin, y + 21).lineTo(right, y + 21)
    .strokeColor('#cbd5e1').lineWidth(0.8).stroke();
  return y + 21;
}

function drawInternalPdfProductRow(doc, item, rowNumber, y) {
  const right = ORDER_PDF_PAGE.width - ORDER_PDF_PAGE.margin;
  const product = item.product || {};
  const qty = Number(item.qty || 0);
  const price = Number(product.price || 0);
  const lineTotal = qty * price;
  const sku = cleanText(product.sku || product.id);
  const productDescription = `${cleanText(product.name, 'Unnamed product')}${sku ? ` [SKU: ${sku}]` : ''}`;

  doc.font('Helvetica').fontSize(9).fillColor('#64748b')
    .text(String(rowNumber), ORDER_PDF_COL.number + 5, y + 30, { width: 12 });

  doc.roundedRect(ORDER_PDF_COL.image, y + 2, 64, 64, 6)
    .fillAndStroke('#ffffff', '#e2e8f0');
  if (product.imageBuffer) {
    try {
      doc.image(product.imageBuffer, ORDER_PDF_COL.image + 3, y + 5, {
        fit: [58, 58],
        align: 'center',
        valign: 'center',
      });
    } catch {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#c40000')
        .text('IMAGE', ORDER_PDF_COL.image + 17, y + 30);
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#c40000')
      .text('IMAGE', ORDER_PDF_COL.image + 17, y + 30);
  }

  doc.font('Helvetica-Bold').fontSize(8.7).fillColor('#334155')
    .text(cleanText(product.code, '-'), ORDER_PDF_COL.code, y + 27, {
      width: ORDER_PDF_COL.product - ORDER_PDF_COL.code - 6,
      height: 22,
      ellipsis: true,
    });
  doc.font('Helvetica-Bold').fontSize(9.4).fillColor('#0f172a')
    .text(productDescription, ORDER_PDF_COL.product, y + 9, {
      width: ORDER_PDF_COL.qty - ORDER_PDF_COL.product - 7,
      height: 50,
      ellipsis: true,
      lineGap: 0.8,
    });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
    .text(String(qty), ORDER_PDF_COL.qty, y + 27, { width: 27, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#475569')
    .text(money(price), ORDER_PDF_COL.unit, y + 27, { width: 47, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
    .text(money(lineTotal), ORDER_PDF_COL.total, y + 27, { width: 58, align: 'right' });

  doc.rect(ORDER_PDF_COL.added + 12, y + 23, 22, 22)
    .strokeColor('#334155').lineWidth(1).stroke();
  doc.moveTo(ORDER_PDF_PAGE.margin, y + ORDER_PDF_ROW_HEIGHT)
    .lineTo(right, y + ORDER_PDF_ROW_HEIGHT)
    .strokeColor('#e2e8f0').lineWidth(0.6).stroke();
  return y + ORDER_PDF_ROW_HEIGHT;
}

function drawInternalPdfTotals(doc, y, totals, promo) {
  const left = ORDER_PDF_PAGE.margin;
  const right = ORDER_PDF_PAGE.width - ORDER_PDF_PAGE.margin;

  doc.font('Helvetica').fontSize(8.5).fillColor('#475569')
    .text('Subtotal (incl. VAT)', left, y + 5);
  doc.font('Helvetica-Bold').fillColor('#0f172a')
    .text(money(totals?.subtotal), right - 90, y + 5, { width: 90, align: 'right' });
  y += 20;

  if (promo?.code) {
    doc.font('Helvetica').fontSize(8).fillColor('#15803d')
      .text(`Promo ${cleanText(promo.code)} (${Number(promo.discountPct || 0)}%)`, left, y + 3);
    doc.font('Helvetica-Bold').fillColor('#15803d')
      .text(`-${money(promo.discountAmount)}`, right - 90, y + 3, { width: 90, align: 'right' });
    y += 18;
  }

  doc.moveTo(left, y).lineTo(right, y).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a')
    .text('Estimated total', left, y + 11);
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#c40000')
    .text(money(totals?.total ?? totals?.subtotal), right - 120, y + 8, {
      width: 120,
      align: 'right',
    });
  return y + 35;
}

function drawInternalPdfStaffNotes(doc, y) {
  const left = ORDER_PDF_PAGE.margin;
  const right = ORDER_PDF_PAGE.width - ORDER_PDF_PAGE.margin;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#334155').text('STAFF NOTES', left, y + 5);
  for (let line = 0; line < 2; line += 1) {
    const lineY = y + 20 + line * 16;
    doc.moveTo(left, lineY).lineTo(right, lineY).strokeColor('#94a3b8').lineWidth(0.6).stroke();
  }
}

function formatPdfAddress(value, fallback = 'To confirm') {
  const text = cleanText(value, fallback);
  const parts = text.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.join('\n') : text;
}

export function buildPdfBuffer({
  items,
  customer,
  totals,
  deliveryMethod,
  customerNotes,
  promo,
  orderNumber,
  orderDate,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: ORDER_PDF_PAGE.margin,
      autoFirstPage: false,
      bufferPages: true,
    });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const safeItems = Array.isArray(items) ? items : [];
    const ref = cleanText(orderNumber, 'Pending');
    const customerCode = cleanText(customer?.customerCode);
    const dateLabel = orderDateLabel(orderDate);
    const deliveryAddress = formatPdfAddress(customer?.deliveryAddress || customer?.region);
    const invoiceAddress = formatPdfAddress(
      customer?.companyAddress || customer?.deliveryAddress || customer?.region,
    );
    const customerName = cleanText(customer?.name, 'Not provided');
    const business = cleanText(customer?.business, '');
    const note = cleanText(customerNotes, '');
    const contentWidth = ORDER_PDF_PAGE.width - ORDER_PDF_PAGE.margin * 2;

    doc.addPage();
    drawInternalPdfLogo(doc);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a')
      .text('INTERNAL ORDER SHEET', 255, 22, { width: 310, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a')
      .text('Order', 350, 51, { width: 70, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#c40000')
      .text(ref, 425, 48, { width: 140, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b')
      .text(`${customerCode ? `Customer code: ${customerCode} · ` : ''}${dateLabel} · ${cleanText(deliveryMethod, 'Delivery to confirm')}`, 255, 69, {
        width: 310,
        align: 'right',
      });
    doc.moveTo(ORDER_PDF_PAGE.margin, 82)
      .lineTo(ORDER_PDF_PAGE.width - ORDER_PDF_PAGE.margin, 82)
      .strokeColor('#cbd5e1').lineWidth(0.8).stroke();

    const panelY = 92;
    const panelHeight = 138;
    doc.roundedRect(ORDER_PDF_PAGE.margin, panelY, contentWidth, panelHeight, 8)
      .fillAndStroke('#f8fafc', '#dbe2ea');
    const dividerX = 313;
    doc.moveTo(dividerX, panelY + 10).lineTo(dividerX, panelY + panelHeight - 10)
      .strokeColor('#d1d9e2').lineWidth(0.7).stroke();

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
      .text('Invoice To', ORDER_PDF_PAGE.margin + 12, panelY + 10);
    let invoiceY = panelY + 27;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
      .text(business || customerName, ORDER_PDF_PAGE.margin + 12, invoiceY, {
        width: 245,
        height: 12,
        ellipsis: true,
      });
    invoiceY += 12;
    if (business && customerName.toLowerCase() !== business.toLowerCase()) {
      doc.font('Helvetica').fontSize(8.3).fillColor('#334155')
        .text(customerName, ORDER_PDF_PAGE.margin + 12, invoiceY, {
          width: 245,
          height: 11,
          ellipsis: true,
        });
      invoiceY += 11;
    }
    doc.font('Helvetica').fontSize(8).fillColor('#334155')
      .text(invoiceAddress, ORDER_PDF_PAGE.margin + 12, invoiceY, {
        width: 245,
        height: 61,
        ellipsis: true,
        lineGap: 0.4,
      });
    doc.font('Helvetica').fontSize(8).fillColor('#475569')
      .text(`Phone: ${cleanText(customer?.phone, 'Not provided')}`, ORDER_PDF_PAGE.margin + 12, panelY + 119, {
        width: 120,
        height: 10,
        ellipsis: true,
      });
    doc.text(`Email: ${cleanText(customer?.email, 'Not provided')}`, ORDER_PDF_PAGE.margin + 133, panelY + 119, {
        width: 124,
        height: 10,
        ellipsis: true,
      });

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a')
      .text('Delivery Address', dividerX + 14, panelY + 10);
    let deliveryY = panelY + 27;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
      .text(customerName, dividerX + 14, deliveryY, {
        width: 224,
        height: 12,
        ellipsis: true,
      });
    deliveryY += 12;
    if (business && customerName.toLowerCase() !== business.toLowerCase()) {
      doc.font('Helvetica').fontSize(8.3).fillColor('#334155')
        .text(business, dividerX + 14, deliveryY, {
          width: 224,
          height: 11,
          ellipsis: true,
        });
      deliveryY += 11;
    }
    doc.font('Helvetica').fontSize(8).fillColor('#334155')
      .text(deliveryAddress, dividerX + 14, deliveryY, {
        width: 224,
        height: 61,
        ellipsis: true,
        lineGap: 0.4,
      });
    if (note) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#475569')
        .text('Notes:', dividerX + 14, panelY + 119, { width: 38 });
      doc.font('Helvetica').text(note, dividerX + 53, panelY + 119, {
        width: 189,
        height: 12,
        ellipsis: true,
      });
    }

    const firstTableHeaderY = panelY + panelHeight + 11;
    const firstRowsStart = firstTableHeaderY + 21;
    const totalsReserve = promo?.code ? 102 : 84;
    const singlePageLimit = Math.max(1, Math.min(
      7,
      Math.floor((ORDER_PDF_PAGE.height - 24 - totalsReserve - firstRowsStart) / ORDER_PDF_ROW_HEIGHT),
    ));
    // When an order continues onto another page, page one does not need to
    // reserve room for totals and staff notes. Eight larger rows fit cleanly.
    const firstPageLimit = safeItems.length > singlePageLimit ? 8 : singlePageLimit;
    const pageSizes = paginateOrderItems(safeItems.length, firstPageLimit);

    let itemOffset = 0;
    let finalContentY = firstRowsStart;
    pageSizes.forEach((pageSize, pageIndex) => {
      if (pageIndex > 0) {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
          .text(`Order ${ref}`, ORDER_PDF_PAGE.margin, 22);
        doc.font('Helvetica').fontSize(8).fillColor('#64748b')
          .text('Items continued', ORDER_PDF_PAGE.margin, 36);
        finalContentY = drawInternalPdfColumnHeader(doc, 51);
      } else {
        finalContentY = drawInternalPdfColumnHeader(doc, firstTableHeaderY);
      }

      safeItems.slice(itemOffset, itemOffset + pageSize).forEach((item, index) => {
        finalContentY = drawInternalPdfProductRow(
          doc,
          item,
          itemOffset + index + 1,
          finalContentY,
        );
      });
      itemOffset += pageSize;

      if (pageIndex === pageSizes.length - 1) {
        finalContentY = drawInternalPdfTotals(doc, finalContentY + 4, totals, promo);
        drawInternalPdfStaffNotes(doc, finalContentY + 3);
      }
    });

    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page += 1) {
      doc.switchToPage(page);
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
        .text(`${ref} · Page ${page - range.start + 1} of ${range.count}`, ORDER_PDF_PAGE.margin, 826, {
          width: contentWidth,
          align: 'right',
          lineBreak: false,
        });
    }
    doc.flushPages();
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
    const unitPrice = Number(product.price || 0);
    const lineTotal = qty * unitPrice;
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
        <td style="padding:12px 7px;border-bottom:1px solid #ececec;color:#0f172a;font-size:14px;font-weight:800;text-align:center;">${qty}</td>
        <td style="padding:12px 7px;border-bottom:1px solid #ececec;color:#475569;font-size:12px;font-weight:700;text-align:right;white-space:nowrap;">${money(unitPrice)}</td>
        <td style="padding:12px 7px;border-bottom:1px solid #ececec;color:#0f172a;font-size:12px;font-weight:800;text-align:right;white-space:nowrap;">${money(lineTotal)}</td>
      </tr>`;
  }).join('');
}

// Single print-friendly, PROTO-branded order email used for BOTH the internal
// team notification and customer acknowledgement. Structured like the packing
// slip: order meta header, contact/delivery, product table, note, estimate.
export function buildOrderEmailHtml({
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
    body, .page-wrap, .receipt-card { background:#ffffff !important; }
    .page-wrap { padding:0 !important; }
    .receipt-card { border-color:#e5e7eb !important; box-shadow:none !important; }
  }
</style></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
<table class="page-wrap" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;padding:24px 12px;"><tr><td align="center">
<table class="receipt-card" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 8px 24px rgba(15,23,42,0.08);">
<tr><td style="height:6px;background:#c40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td align="center" style="padding:28px 34px 24px;background:#ffffff;border-bottom:1px solid #e5e7eb;">
  <div style="display:inline-block;background:#000000;padding:4px 8px;border-radius:9px;margin-bottom:18px;line-height:0;overflow:hidden;">
    <img src="https://site.proto.co.za/proto-trading-online-email.png" alt="Proto Trading Online" width="280" height="77" style="display:block;width:280px;max-width:100%;height:auto;border:0;" />
  </div>
  <h1 style="margin:0;color:#0f172a;font-size:28px;line-height:1.2;font-weight:900;letter-spacing:-0.4px;">${heading}</h1>
  <p style="margin:10px 0 0;color:#475569;font-size:14px;line-height:1.6;">${subheading}${ref ? ` &nbsp;·&nbsp; <span style="color:#c40000;font-weight:800;">${ref}</span>` : ''}</p>
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
        <th style="text-align:center;padding:0 7px 10px;font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #ececec;">Qty</th>
        <th style="text-align:right;padding:0 7px 10px;font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #ececec;white-space:nowrap;">Unit price</th>
        <th style="text-align:right;padding:0 7px 10px;font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#94a3b8;border-bottom:2px solid #ececec;white-space:nowrap;">Line total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${totalsBlock}
  ${notesBlock}
  <p style="margin:26px 0 0;color:#666666;font-size:13px;line-height:1.6;">Questions? Contact us at <a href="mailto:online@proto.co.za" style="color:#c40000;">online@proto.co.za</a> or call <a href="tel:+27214615883" style="color:#c40000;">+27 21 461 5883</a>.</p>
</td></tr>
<tr><td align="center" style="padding:24px 34px;background:#ffffff;border-top:1px solid #e5e7eb;">
  <p style="margin:0 0 8px;color:#0f172a;font-size:18px;font-weight:900;">Proto Trading Online</p>
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
  // Prefer the trusted Positill account code once the customer has been created
  // there and the active-customer register has synced. The website profile is a
  // fallback for codes allocated manually in the portal. Matching is only by
  // the authenticated user's verified email.
  let customerCode = cleanText(profile.customer_code);
  try {
    const verifiedEmail = cleanText(user.email).toLowerCase();
    if (verifiedEmail) {
      const { data: positillCustomer } = await portal
        .from('proto_active_customers')
        .select('account_code')
        .eq('email', verifiedEmail)
        .maybeSingle();
      customerCode = cleanText(positillCustomer?.account_code) || customerCode;
    }
  } catch (err) {
    console.warn('send-order: Positill customer code lookup failed:', err?.message || err);
  }

  const customer = {
    name: cleanText(
      profile.contact_name || profile.name || profile.first_name || profile.business_name,
      'Trade customer',
    ),
    business: cleanText(profile.business_name),
    customerCode,
    email: cleanText(user.email),
    phone: cleanText(profile.phone),
    companyAddress: cleanText(profile.company_address || profile.delivery_address, 'To confirm'),
    deliveryAddress: cleanText(profile.delivery_address || [
      profile.unit_number ? `Unit ${profile.unit_number}` : '',
      profile.street_name,
      profile.suburb,
      profile.city,
      profile.postal_code,
      profile.province,
      profile.country,
    ].filter(Boolean).join(', '), 'To confirm'),
    region: cleanText([profile.city, profile.province, profile.country].filter(Boolean).join(', '), 'To confirm'),
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

  // Generate the polished order sheet first. If that renderer fails, fall back
  // to the independently maintained fulfilment PDF so the operational email is
  // never silently sent without an attachment.
  let pdfBuffer = null;
  let pdfSource = 'order-email';
  try {
    const preparedItems = await prepareItems(orderItems);
    pdfBuffer = await buildPdfBuffer({
      items: preparedItems,
      customer,
      totals,
      deliveryMethod,
      customerNotes,
      promo,
      orderNumber,
      orderDate: captured.created_at,
    });
  } catch (err) {
    console.error('send-order: PDF generation failed:', err?.stack || err?.message || err);
    try {
      const fallback = await generateAndStoreOrderPdf(orderId);
      pdfBuffer = fallback?.buffer || null;
      pdfSource = 'fulfilment-fallback';
      console.warn('send-order: attached fulfilment PDF fallback:', orderNumber);
    } catch (fallbackErr) {
      console.error('send-order: fallback PDF generation failed:', fallbackErr?.stack || fallbackErr?.message || fallbackErr);
    }
  }

  const attachment = pdfBuffer
    ? [{
        name: `proto-order-${cleanText(orderNumber, String(Date.now()))}.pdf`,
        content: pdfBuffer.toString('base64'),
      }]
    : undefined;

  let emailDeliveryFailed = false;
  let emailFailReason = null;
  let emailMessageId = null;
  if (!attachment) {
    emailDeliveryFailed = true;
    emailFailReason = 'Order PDF could not be generated';
    console.error('send-order: team email not sent because no PDF attachment was available:', orderNumber);
  } else try {
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
      // Bounded: a hung Brevo connection must not hold the checkout function
      // open (it previously had no timeout at all).
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      const msg = body.message || `Brevo ${resp.status}`;
      console.error('Brevo API error:', resp.status, JSON.stringify(body));
      emailDeliveryFailed = true;
      emailFailReason = msg;
    } else {
      const body = await resp.json().catch(() => ({}));
      emailMessageId = cleanText(body.messageId);
      console.info('send-order: team email accepted by Brevo', {
        orderNumber,
        recipients: notifyEmails,
        pdfAttached: true,
        pdfSource,
        messageId: emailMessageId || null,
      });
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

    // The order is already durably saved at this point, and these three tasks
    // are independent of one another. Running them CONCURRENTLY (instead of
    // serially) cuts the time this function is held open from the sum of three
    // network fan-outs to the slowest one — which is what protects serverless
    // concurrency during a burst of checkouts. Each is individually best-effort:
    // a failure is logged and never fails the order.
    const [notifySettled, tierSettled, ackSettled] = await Promise.allSettled([
      // 1) Team WhatsApp notification (+ stored fulfilment PDF).
      runOrderTeamNotify(orderId, {
        emailSent: !emailDeliveryFailed,
        emailRecipients: notifyEmails,
        emailMessageId,
        pdfAttached: Boolean(attachment),
        pdfSource,
      }),

      // 2) Premium tier upgrade — recomputed server-side from the stored order
      //    row, never from client-sent totals.
      (async () => {
        const supabase = getPortalAdminClient();
        const { data: order } = await supabase
          .from('orders')
          .select('customer_id, items')
          .eq('id', orderId)
          .maybeSingle();
        const storedItems = Array.isArray(order?.items) ? order.items : [];
        const serverTotal = storedItems.reduce(
          (sum, it) => sum + Number(it.unitPrice || 0) * Number(it.qty || 0),
          0,
        );
        const qualifies = serverTotal > 4000 && storedItems.some((it) => Number(it.qty || 0) > 10);
        if (qualifies && order?.customer_id) {
          await supabase
            .from('customers')
            .update({ tier: 'premium' })
            .eq('id', order.customer_id)
            .eq('tier', 'regular');
        }
      })(),

      // 3) Customer acknowledgement email (to their verified account email).
      sendCustomerOrderAck({
        customer,
        toEmail: user?.email,
        orderNumber,
        items: orderItems,
        totals,
        deliveryMethod,
        customerNotes,
        promo,
      }),
    ]);

    if (notifySettled.status === 'fulfilled') {
      notifyResult = notifySettled.value;
    } else {
      console.error('send-order: team notify failed:', notifySettled.reason?.message || notifySettled.reason);
    }
    // Keep a server-side trace for the other two as well — allSettled would
    // otherwise swallow them, leaving a missing acknowledgement email or a
    // silently-skipped tier upgrade with no evidence in the logs.
    for (const [label, settled] of [['premium tier check', tierSettled], ['customer ack email', ackSettled]]) {
      if (settled.status === 'rejected') {
        console.error(`send-order: ${label} failed:`, settled.reason?.message || settled.reason);
      }
    }
  }

  return res.status(200).json({
    success: true,
    orderId,
    dbCaptureFailed: false,
    emailDeliveryFailed,
    emailFailReason: emailDeliveryFailed ? emailFailReason : null,
    pdfAttached: Boolean(attachment),
    emailMessageId,
    notify: notifyResult,
    notifyWarning: notifyResult && !notifyResult.ok
      ? notifyResult.statusBlockedReason || 'WhatsApp team notification did not reach everyone'
      : null,
  });
}
