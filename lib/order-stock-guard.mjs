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

export function isStockOrderableAvailability(availability = {}) {
  return availability?.canOrder === true
    && ['landed', 'incoming_preorder'].includes(availability?.state);
}

export function aggregateRequestedQuantities(lines = []) {
  const totals = new Map();
  for (const line of lines) {
    if (line?.isToOrder || line?.stockOrderable) continue;
    const sku = String(line?.sku || '').trim().toUpperCase();
    const quantity = Number(line?.quantity ?? line?.qty);
    if (!sku || !Number.isSafeInteger(quantity) || quantity < 1) continue;
    totals.set(sku, (totals.get(sku) || 0) + quantity);
  }
  return totals;
}

export function mergeCheckoutReviewChanges(changes = []) {
  const bySku = new Map();
  for (const change of changes) {
    const key = String(change?.sku || '').trim().toUpperCase();
    if (!key) continue;
    const previous = bySku.get(key);
    if (!previous) {
      bySku.set(key, change);
      continue;
    }
    bySku.set(key, {
      ...previous,
      requestedQty: Math.max(previous.requestedQty || 0, change.requestedQty || 0),
      priceChanged: Boolean(previous.priceChanged || change.priceChanged),
      stockChanged: Boolean(previous.stockChanged || change.stockChanged),
      stockUnavailable: Boolean(previous.stockUnavailable || change.stockUnavailable),
      quantityExceedsStock: Boolean(previous.quantityExceedsStock || change.quantityExceedsStock),
      previousPrice: previous.previousPrice === change.previousPrice ? previous.previousPrice : null,
      previousStockQty: previous.previousStockQty === change.previousStockQty
        ? previous.previousStockQty
        : null,
      matchKeys: [...new Set([
        ...(Array.isArray(previous.matchKeys) ? previous.matchKeys : []),
        ...(Array.isArray(change.matchKeys) ? change.matchKeys : []),
      ].map((value) => String(value || '').trim()).filter(Boolean))],
    });
  }
  return [...bySku.values()];
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
  stockOrderable = false,
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
  const stockConstrained = !isToOrder && !stockOrderable;
  const stockChanged = stockConstrained && (previousStockQty === null || previousStockQty !== nextStockQty);
  const stockUnavailable = stockConstrained && nextStockQty === null;
  const quantityExceedsStock = stockConstrained && (nextStockQty === null || requestedQty > nextStockQty);

  if (!priceChanged && !stockChanged && !stockUnavailable && !quantityExceedsStock) return null;

  return {
    sku: String(sku || '').trim(),
    name: String(name || sku || 'Product').trim(),
    toOrder: Boolean(isToOrder),
    stockOrderable: Boolean(stockOrderable),
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
