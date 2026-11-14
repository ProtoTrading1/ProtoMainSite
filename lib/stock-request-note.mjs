// Only the server's authoritative stock check creates stockRequest on a saved
// order. This text is advisory: an order request does not reserve stock.
export function stockRequestNote(product = {}) {
  const value = product.stockRequest;
  if (!value || !Number.isFinite(value.availableQty) || !Number.isFinite(value.requestedQty)
    || !Number.isFinite(value.shortfallQty) || value.shortfallQty <= 0) return '';
  return `${value.availableQty === 0 ? 'Out of stock' : 'Stock shortage'}: ${value.availableQty} available, ${value.requestedQty} requested${value.sharedStock ? ' across options' : ''}. ${value.shortfallQty} subject to team confirmation; availability and delivery are not guaranteed.`;
}
