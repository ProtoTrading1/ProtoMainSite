export const MAX_CART_QUANTITY = 9999;

export function normalizeCartQuantity(value, fallback = 1, minimum = 1) {
  const safeMinimum = Math.max(1, Math.min(MAX_CART_QUANTITY, Math.floor(Number(minimum) || 1)));
  if (value === '' || value === null || value === undefined) return normalizeCartQuantity(fallback, safeMinimum, safeMinimum);
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(safeMinimum, Number(fallback) || safeMinimum);
  return Math.max(safeMinimum, Math.min(MAX_CART_QUANTITY, Math.floor(numeric)));
}

export function stepCartQuantity(draftValue, persistedValue, delta, minimum = 1) {
  const fallback = normalizeCartQuantity(persistedValue, minimum, minimum);
  const current = normalizeCartQuantity(draftValue, fallback, minimum);
  return normalizeCartQuantity(current + delta, fallback, minimum);
}
