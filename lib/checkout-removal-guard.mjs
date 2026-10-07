import { normalizeIncomingAvailability } from './product-availability.mjs';
import { normalizeItemPreference } from './item-preference.mjs';

const STATUSES = new Set(['none', 'on_the_way', 'customs', 'landed_awaiting_grv', 'partially_received']);
const skuKey = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const exactText = value => typeof value === 'string' ? value : '';
function rawNumber(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

// Keep the ordinary catalogue projection, but never equate missing/malformed
// incoming evidence with a successful, complete no-override lookup.
export function checkoutIncomingObservation(data, requestedSkus) {
  const rows = data || [];
  const incomingBySku = new Map(rows.map(row => [String(row.sku || '').trim(), normalizeIncomingAvailability(row)]));
  let known = Array.isArray(data);
  const requested = new Set(requestedSkus);
  const seen = new Set();
  for (const row of rows) {
    const key = skuKey(row.sku);
    const quantity = rawNumber(row.incoming_qty);
    const etaValid = row.incoming_eta === null || (typeof row.incoming_eta === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.incoming_eta));
    if (!key || typeof row.sku !== 'string' || !requested.has(row.sku) || row.sku !== row.sku.trim() || seen.has(key)
      || !STATUSES.has(row.incoming_status) || quantity === null || quantity < 0
      || typeof row.allow_preorder !== 'boolean' || !etaValid
      || (row.incoming_status === 'none' && (quantity !== 0 || row.allow_preorder !== false || row.incoming_eta !== null))
      || (row.incoming_status !== 'none' && quantity <= 0)) known = false;
    seen.add(key);
  }
  return { incomingBySku, known };
}

export function stockOrderableAvailability(availability) {
  return availability?.canOrder === true && ['landed', 'incoming_preorder'].includes(availability.state);
}

export function checkoutRemovalProof({ item, lineIndex, row, availability, incomingKnown, uniqueRow }) {
  const product = item?.product || {};
  const eligible = product.stockRemovalSource === 'main' && product.isExtendedRange !== true
    && Number.isSafeInteger(lineIndex) && lineIndex >= 0
    && typeof product.sku === 'string' && !!skuKey(product.sku) && skuKey(product.sku) === skuKey(row?.sku)
    && incomingKnown === true && uniqueRow === true && row?.to_order === false
    && rawNumber(row?.available_stock) === 0
    && availability?.canOrder === false && availability.state === 'out_of_stock'
    && Number.isSafeInteger(item.qty) && item.qty > 0
    && [product.id, product.sku, product.code].every(value => value === undefined || typeof value === 'string');
  if (!eligible) return { eligible: false };
  return { eligible: true, source: 'main', lineIndex,
    productId: exactText(product.id), sku: exactText(product.sku), code: exactText(product.code),
    qty: item.qty, preference: normalizeItemPreference(item.preference) };
}
