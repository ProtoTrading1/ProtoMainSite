import { resolveProductAvailability } from '../../lib/product-availability.mjs';

export const MAX_QUICK_ORDER_LINES = 200;

export function normalizeQuickOrderCode(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '').trim().toUpperCase();
}

function normalizeQuickOrderQty(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 1;
  return Math.min(9999, Math.floor(numeric));
}

function parseQuickOrderLine(rawLine, index) {
  const raw = String(rawLine || '').trim();
  if (!raw) return null;

  const delimited = raw.split(/[\t,;]+/).map((part) => part.trim()).filter(Boolean);
  let code = delimited[0] || '';
  let qty = delimited[1];

  if (delimited.length === 1) {
    const compact = raw.match(/^([^\s]+)(?:\s+[xX×]?\s*(\d+(?:\.\d+)?))?$/);
    if (compact) {
      code = compact[1];
      qty = compact[2];
    }
  }

  return {
    id: `quick-order-${index}-${normalizeQuickOrderCode(code)}`,
    sourceLine: index + 1,
    code: normalizeQuickOrderCode(code),
    qty: normalizeQuickOrderQty(qty),
  };
}

export function parseQuickOrderText(value, limit = MAX_QUICK_ORDER_LINES) {
  const parsed = String(value || '')
    .split(/\r?\n/)
    .map(parseQuickOrderLine)
    .filter((line) => line?.code && !['ITEM CODE', 'ITEM_CODE', 'SKU', 'PRODUCT CODE'].includes(line.code))
    .slice(0, limit);

  const combined = new Map();
  for (const line of parsed) {
    const current = combined.get(line.code);
    if (current) {
      current.qty = Math.min(9999, current.qty + line.qty);
      current.sourceLines.push(line.sourceLine);
      continue;
    }
    combined.set(line.code, { ...line, sourceLines: [line.sourceLine] });
  }
  return [...combined.values()];
}

function productKeys(product) {
  return [
    product?.id,
    product?.sku,
    product?.websiteSku,
    product?.code,
    product?.barcode,
  ].map(normalizeQuickOrderCode).filter(Boolean);
}

export function buildQuickOrderProductIndex(products) {
  const index = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    for (const key of productKeys(product)) {
      if (!index.has(key)) index.set(key, product);
    }
  }
  return index;
}

export function quickOrderAvailability(product) {
  if (product?.availability?.state) return product.availability;
  const rawStock = product?.stockOnHand ?? product?.stockQty ?? null;
  return resolveProductAvailability({
    stockQty: rawStock,
    toOrder: Boolean(product?.toOrder || product?.orderableWhenOutOfStock),
    incoming: product,
  });
}

export function quickOrderImage(product) {
  return String(
    product?.image
    || product?.localImage
    || product?.nutstoreImage
    || product?.nutstore_image_url
    || '',
  ).trim();
}

export function resolveQuickOrderLines(lines, products) {
  const index = products instanceof Map ? products : buildQuickOrderProductIndex(products);
  return (Array.isArray(lines) ? lines : []).map((line) => {
    const product = index.get(normalizeQuickOrderCode(line.code)) || null;
    if (!product) return { ...line, product: null, status: 'not_found', valid: false };

    const minimum = Math.max(1, Math.min(9999, Math.floor(Number(product.minQty) || 1)));
    const qty = normalizeQuickOrderQty(line.qty);
    const availability = quickOrderAvailability(product);
    const price = Number(product.price) || 0;
    const image = quickOrderImage(product);

    if (!availability.canOrder) {
      return {
        ...line,
        product,
        qty,
        minimum,
        availability,
        image,
        price,
        lineTotal: price * qty,
        status: 'unavailable',
        valid: false,
      };
    }

    if (qty < minimum) {
      return {
        ...line,
        product,
        qty,
        minimum,
        availability,
        image,
        price,
        lineTotal: price * qty,
        status: 'below_minimum',
        valid: false,
      };
    }

    return {
      ...line,
      product,
      qty,
      minimum,
      availability,
      image,
      price,
      lineTotal: price * qty,
      status: 'matched',
      valid: true,
    };
  });
}

export function updateQuickOrderLineQty(lines, lineId, value) {
  return (Array.isArray(lines) ? lines : []).map((line) => {
    if (line.id !== lineId) return line;
    const qty = normalizeQuickOrderQty(value);
    const minimum = Math.max(1, Number(line.minimum) || 1);
    const unavailable = line.product && line.availability?.canOrder === false;
    const status = unavailable ? 'unavailable' : qty < minimum ? 'below_minimum' : line.product ? 'matched' : 'not_found';
    return {
      ...line,
      qty,
      status,
      valid: status === 'matched',
      lineTotal: (Number(line.price) || 0) * qty,
    };
  });
}
