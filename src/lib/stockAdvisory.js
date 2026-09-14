// Defensive customer-facing stock advisory. Normal catalogue lines are capped
// before this helper is reached and validated again by the checkout API. The
// advisory remains for a restored/stale basket while the customer reviews it.
//
// It deliberately shows NO warning for genuine "to order" products, which
// remain the sole exception to the stock cap.

function canOrderBeyondStock(product) {
  return product?.toOrder === true
    || product?.to_order === true
    || product?.orderableWhenOutOfStock === true
    || product?.orderable_when_out_of_stock === true;
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
