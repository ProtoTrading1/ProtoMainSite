/** Final customer-facing guard: a product without a positive price is never visible. */
export function isSafeStorefrontProduct(row) {
  const price = Number(row?.price);
  return Number.isFinite(price) && price > 0;
}
