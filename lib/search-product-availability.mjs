import { customerAvailabilityLabel, resolveProductAvailability } from './product-availability.mjs';
import { isLandedStockAvailable, isToOrderProduct, normaliseStockQty } from './order-stock-guard.mjs';

// Search presents the same incoming-stock contract as product cards. Ordering
// follows the shared stock guard, including the explicit arrived-stock rule.
export function searchProductAvailability(product = {}) {
  const raw = product.stockOnHand ?? product.stockQty ?? product.available_stock ?? product.stock_qty;
  const toOrder = isToOrderProduct(product);
  const availability = product.availability?.state ? product.availability : resolveProductAvailability({
    stockQty: raw,
    toOrder,
    incoming: product,
  });
  const qty = normaliseStockQty(raw);
  const canOrder = availability.canOrder && (toOrder || isLandedStockAvailable({ ...product, availability }) || (qty !== null && qty > 0));
  const tone = { in_stock: 'in', low_stock: 'low', landed: 'in', to_order: 'order', incoming: 'order', incoming_preorder: 'order' }[availability.state] || 'out';
  return { tone, label: customerAvailabilityLabel(availability), canOrder: Boolean(canOrder) };
}
