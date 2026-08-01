const VAT_MULTIPLIER = 1.15;
const WEBSITE_PRICE_STEP = 0.5;

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function websitePriceFromExVat(value) {
  const price = positiveNumber(value);
  if (price == null) return 0;
  return Math.round((price * VAT_MULTIPLIER) / WEBSITE_PRICE_STEP) * WEBSITE_PRICE_STEP;
}

export function looksLikeExVatPrice(value) {
  const price = positiveNumber(value);
  if (price == null) return false;
  if (Math.round(price * 100) % 50 === 0) return false;
  const inclusive = price * VAT_MULTIPLIER;
  const nearestGridPrice = Math.round(inclusive / WEBSITE_PRICE_STEP) * WEBSITE_PRICE_STEP;
  return Math.abs(inclusive - nearestGridPrice) <= 0.01;
}

/**
 * Defence in depth at the customer boundary. Migration 058 repairs and guards
 * the database; this prevents a matching raw source price from ever being
 * labelled "Incl. VAT" while a stale cache or delayed sync is being replaced.
 */
export function customerFacingCataloguePrice(value) {
  const price = positiveNumber(value);
  if (price == null) return 0;
  return looksLikeExVatPrice(price) ? websitePriceFromExVat(price) : price;
}
