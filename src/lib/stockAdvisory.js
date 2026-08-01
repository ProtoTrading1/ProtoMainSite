// Customer-facing "you're ordering more than we have in stock" advisory.
//
// The storefront is a wholesale *quote request* the team confirms, so ordering
// more than current stock is a legitimate backorder request — we allow it, but
// warn clearly instead of silently reducing the line. This helper decides when
// to show that warning and by how much the request exceeds stock.
//
// It deliberately shows NO warning for cases where over-stock ordering is
// expected/normal, matching the rules already encoded in `products.js`
// (isOrderableWhenOutOfStock) and `App.jsx` (cart cap helpers):
//   - "to order" products (orderable at any qty, even 0 stock)
//   - live backorders (stock on hand <= 0)
//   - products whose stock is unknown

function canOrderBeyondStock(product) {
  return product?.toOrder === true
    || product?.to_order === true
    || product?.orderableWhenOutOfStock === true
    || product?.orderable_when_out_of_stock === true
    || product?.availability?.canOrder === true;
}

function availableStockOf(product) {
  const raw = product?.stockOnHand ?? product?.stockQty ?? product?.available_stock ?? product?.stock_qty;
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * @returns {{ availableStock: number|null, isOverOrder: boolean, shortfall: number }}
 *   isOverOrder is true only when stock is a known positive number, the product
 *   is not "to order"/backorder, and the requested quantity exceeds stock.
 *   shortfall is how many units beyond stock were requested (0 when not over).
 */
export function stockAdvisoryForQty(product, qty) {
  const availableStock = availableStockOf(product);
  const requested = Number(qty) || 0;
  if (
    availableStock === null
    || availableStock <= 0
    || canOrderBeyondStock(product)
    || requested <= availableStock
  ) {
    return { availableStock, isOverOrder: false, shortfall: 0 };
  }
  const inStock = Math.floor(availableStock);
  return { availableStock: inStock, isOverOrder: true, shortfall: requested - inStock };
}
