export const MAX_CART_QUANTITY = 9999;

export function normalizeCartQuantity(value, fallback = 1) {
  if (value === '' || value === null || value === undefined) return normalizeCartQuantity(fallback);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(MAX_CART_QUANTITY, Math.floor(numeric)));
}

export function stepCartQuantity(draftValue, persistedValue, delta) {
  const fallback = normalizeCartQuantity(persistedValue);
  const current = normalizeCartQuantity(draftValue, fallback);
  return normalizeCartQuantity(current + delta, fallback);
}
