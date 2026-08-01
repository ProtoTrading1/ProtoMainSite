export const INCOMING_STOCK_STATUSES = Object.freeze([
  'none',
  'on_the_way',
  'customs',
  'landed_awaiting_grv',
  'partially_received',
]);

const ETA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatIncomingEta(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return String(value || '');
  const month = ETA_MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : String(value || '');
}

export function normalizeIncomingAvailability(value = {}) {
  const status = INCOMING_STOCK_STATUSES.includes(value?.incoming_status)
    ? value.incoming_status
    : INCOMING_STOCK_STATUSES.includes(value?.incomingStatus)
      ? value.incomingStatus
      : 'none';
  const quantity = Number(value?.incoming_qty ?? value?.incomingQty);
  return {
    incomingStatus: status,
    incomingQty: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
    incomingEta: String(value?.incoming_eta ?? value?.incomingEta ?? '').slice(0, 10),
    shipmentRef: String(value?.shipment_ref ?? value?.shipmentRef ?? '').trim().slice(0, 120),
    allowPreorder: Boolean(value?.allow_preorder ?? value?.allowPreorder),
  };
}

export function resolveProductAvailability({ stockQty = null, toOrder = false, incoming = null } = {}) {
  const numericStock = stockQty === null || stockQty === undefined || stockQty === ''
    ? null
    : Number(stockQty);
  const stock = Number.isFinite(numericStock) ? numericStock : null;
  const next = normalizeIncomingAvailability(incoming || {});
  // shipmentRef is intentionally admin-only and must never become part of the
  // storefront availability contract.
  const publicIncoming = {
    incomingStatus: next.incomingStatus,
    incomingQty: next.incomingQty,
    incomingEta: next.incomingEta,
    allowPreorder: next.allowPreorder,
  };

  if (stock !== null && stock > 5) {
    return { state: 'in_stock', label: 'In stock', guidance: 'Available now', canOrder: true, stockQty: stock, ...publicIncoming };
  }
  if (stock !== null && stock > 0) {
    return { state: 'low_stock', label: 'Low stock', guidance: 'Check live stock', canOrder: true, stockQty: stock, ...publicIncoming };
  }
  if (next.incomingQty > 0 && ['landed_awaiting_grv', 'partially_received'].includes(next.incomingStatus)) {
    return { state: 'landed', label: 'Landed — being received', guidance: 'Available subject to confirmation', canOrder: true, stockQty: stock, ...publicIncoming };
  }
  if (toOrder) {
    return { state: 'to_order', label: 'Available to order', guidance: 'Made or sourced on request', canOrder: true, stockQty: stock, ...publicIncoming };
  }
  if (next.incomingQty > 0 && ['on_the_way', 'customs'].includes(next.incomingStatus)) {
    return {
      state: next.allowPreorder ? 'incoming_preorder' : 'incoming',
      label: next.allowPreorder ? 'On the way — pre-order' : 'On the way',
      guidance: next.incomingEta ? `Expected ${formatIncomingEta(next.incomingEta)}` : 'Arrival date to be confirmed',
      canOrder: next.allowPreorder,
      stockQty: stock,
      ...publicIncoming,
    };
  }
  return { state: 'out_of_stock', label: 'Out of stock', guidance: 'Not currently orderable', canOrder: false, stockQty: stock, ...publicIncoming };
}
