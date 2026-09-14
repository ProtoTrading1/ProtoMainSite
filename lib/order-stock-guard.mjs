// The checkout stock guard has one deliberate exception: products explicitly
// marked "To order". Those lines are sourced on request, so a physical
// on-hand quantity is not a cap. Every other line must have verified stock.

export function isToOrderProduct(product) {
  return product?.toOrder === true
    || product?.to_order === true
    || product?.orderableWhenOutOfStock === true
    || product?.orderable_when_out_of_stock === true;
}

export function normaliseStockQty(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.floor(numeric));
}

export function normaliseUnitPrice(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100) / 100;
}

export function checkoutSnapshotForProduct(product) {
  return {
    unitPrice: normaliseUnitPrice(product?.price),
    stockQty: normaliseStockQty(
      product?.stockOnHand ?? product?.stockQty ?? product?.available_stock ?? product?.stock_qty,
    ),
  };
}

// Returns a single customer-safe description of a changed line. This is used
// by the server before it captures an order and by tests without a database.
export function evaluateCheckoutSnapshot({
  sku,
  name,
  quantity,
  isToOrder = false,
  submittedSnapshot = {},
  currentPrice,
  currentStockQty,
}) {
  const previousPrice = normaliseUnitPrice(submittedSnapshot?.unitPrice);
  const nextPrice = normaliseUnitPrice(currentPrice);
  const previousStockQty = normaliseStockQty(submittedSnapshot?.stockQty);
  const nextStockQty = normaliseStockQty(currentStockQty);
  const requestedQty = Math.max(1, Math.floor(Number(quantity) || 0));
  const priceChanged = previousPrice === null || nextPrice === null || previousPrice !== nextPrice;
  const stockChanged = !isToOrder && (previousStockQty === null || previousStockQty !== nextStockQty);
  const stockUnavailable = !isToOrder && nextStockQty === null;
  const quantityExceedsStock = !isToOrder && (nextStockQty === null || requestedQty > nextStockQty);

  if (!priceChanged && !stockChanged && !stockUnavailable && !quantityExceedsStock) return null;

  return {
    sku: String(sku || '').trim(),
    name: String(name || sku || 'Product').trim(),
    toOrder: Boolean(isToOrder),
    requestedQty,
    previousPrice,
    currentPrice: nextPrice,
    previousStockQty,
    currentStockQty: nextStockQty,
    priceChanged,
    stockChanged,
    stockUnavailable,
    quantityExceedsStock,
  };
}
