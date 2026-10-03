import { itemPreferenceFields, normalizeItemPreference } from './item-preference.mjs';

export function basketProductKey(product) {
  return ([product?.id, product?.sku, product?.code]
    .map((value) => value === undefined || value === null ? '' : String(value).trim())
    .find(Boolean) || '').toUpperCase();
}

export function basketPreferenceKey(preference) {
  return normalizeItemPreference(preference).replace(/\s+/g, ' ').toLowerCase();
}

export function basketLineKey(item) {
  // JSON avoids delimiter collisions and can be used in a DOM data attribute.
  return JSON.stringify([basketProductKey(item?.product), basketPreferenceKey(item?.preference)]);
}

export function mergeBasketLines(items) {
  const merged = [];
  const byKey = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const key = basketLineKey(item);
    const existing = byKey.get(key);
    if (!existing) {
      const copy = { ...item, ...itemPreferenceFields(item) };
      byKey.set(key, copy);
      merged.push(copy);
      continue;
    }
    const combined = existing.qty + item.qty;
    if (!Number.isSafeInteger(combined)) {
      const error = new Error('Combined basket quantity must be a safe whole number.');
      error.status = 400;
      throw error;
    }
    // Retain a legacy over-limit request for explicit customer correction.
    // New mutations enforce limits; normalization must never erase quantity.
    existing.qty = combined;
  }
  return merged;
}

export function basketProductQuantity(items, product) {
  const key = basketProductKey(product);
  return items.reduce((total, item) => basketProductKey(item.product) === key ? total + item.qty : total, 0);
}

export function basketLineQuantityLimit(items, target, quantityCapForProduct) {
  const key = basketLineKey(target);
  const others = items.reduce((total, item) => basketProductKey(item.product) === basketProductKey(target.product)
    && basketLineKey(item) !== key ? total + item.qty : total, 0);
  return Math.max(0, Math.min(9999, quantityCapForProduct(target.product) - others));
}

export function addBasketLine(items, incoming, { quantityCapForProduct, maxLines = 250 } = {}) {
  const next = mergeBasketLines(items);
  const line = { ...incoming, ...itemPreferenceFields(incoming) };
  const existing = next.find((item) => basketLineKey(item) === basketLineKey(line));
  if (!existing && next.length >= maxLines) return { items: next, addedQty: 0, reason: 'line_limit' };
  const remaining = Math.max(0, quantityCapForProduct(line.product) - basketProductQuantity(next, line.product));
  const minimum = Math.max(1, Math.floor(Number(line.product.minQty) || 1));
  const requested = Math.max(minimum, Math.floor(Number(line.qty) || 1));
  const addedQty = Math.min(remaining, requested, 9999 - (existing?.qty || 0));
  if (addedQty <= 0 || (!existing && addedQty < minimum)) return { items: next, addedQty: 0, reason: 'stock_limit' };
  if (existing) existing.qty += addedQty;
  else next.push({ ...line, qty: addedQty });
  return { items: next, addedQty, reason: addedQty < requested ? 'stock_limit' : null };
}

export function updateBasketLineQuantity(items, lineKey, quantity, quantityCapForProduct) {
  const next = mergeBasketLines(items);
  const target = next.find((item) => basketLineKey(item) === lineKey);
  if (!target) return next;
  const maxQty = basketLineQuantityLimit(next, target, quantityCapForProduct);
  const minimum = Math.max(1, Math.min(maxQty, Math.floor(Number(target.product.minQty) || 1)));
  // A newly unavailable line must remain visible for review/removal. Never
  // silently delete it while the customer edits another preference's quantity.
  if (maxQty < 1) return next;
  target.qty = Math.max(minimum, Math.min(maxQty, Math.floor(Number(quantity) || 1)));
  return next;
}

export function removeBasketLine(items, lineKey) {
  return items.filter((item) => basketLineKey(item) !== lineKey);
}
