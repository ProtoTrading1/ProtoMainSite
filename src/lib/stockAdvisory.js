import { isSarongiInstoreRequest } from '../../lib/sarongi-instore-requests.mjs';
// Customer-facing warning for existing baskets. Catalogue add limits are
// unchanged; checkout accepts known-stock shortages as requests for confirmation.
// Explicit to-order and in-store request products retain their own messaging.

function canOrderBeyondStock(product) {
  return isSarongiInstoreRequest(product) || product?.toOrder === true
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
 *   isOverOrder is true only when stock is a known number, the product
 *   is not "to order"/backorder, and the requested quantity exceeds stock.
 *   shortfall is how many units beyond stock were requested (0 when not over).
 */
export function stockAdvisoryForQty(product, qty) {
  const availableStock = availableStockOf(product);
  const requested = Number(qty) || 0;
  if (
    availableStock === null
    || canOrderBeyondStock(product)
    || requested <= Math.max(0, availableStock)
  ) {
    return { availableStock, isOverOrder: false, shortfall: 0 };
  }
  const inStock = Math.max(0, Math.floor(availableStock));
  return { availableStock: inStock, isOverOrder: true, shortfall: requested - inStock };
}
