export const SOUTH_AFRICA_VAT_RATE = 0.15;

export function roundCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Positill supplies website_stock.price excluding VAT. Customer-facing
 * catalogue and checkout prices include South African VAT.
 */
export function priceIncludingVat(excludingVat, vatRate = SOUTH_AFRICA_VAT_RATE) {
  const amount = Number(excludingVat);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return roundCurrency(amount * (1 + vatRate));
}
