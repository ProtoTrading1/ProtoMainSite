const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;

// Receipt routing is scoped to the exact authenticated account epoch. History
// rows never establish receipt acceptance, and there is no latest-order fallback.
export function createOrderReceiptTarget(request, customerId, identity) {
  if (!text(customerId) || !identity || !request || request.customerId !== customerId || identity?.userId !== customerId
    || (request.identity && request.identity !== identity)) return null;
  if (request.kind === 'unconfirmed') return { kind: 'unconfirmed', customerId, identity };
  if (request.kind !== 'received' || !text(request.orderId) || !text(request.orderNumber)) return null;
  return { kind: 'received', customerId, identity, orderId: request.orderId, orderNumber: request.orderNumber };
}
export function visibleOrderReceiptTarget(target, customerId, identity) {
  return target?.identity === identity ? createOrderReceiptTarget(target, customerId, identity) : null;
}
export function exactReceiptOrder(orders, target) {
  if (target?.kind !== 'received') return null;
  const matches = (Array.isArray(orders) ? orders : []).filter(order => order?.customer_id === target.customerId
    && order.id === target.orderId && order.order_number === target.orderNumber);
  return matches.length === 1 ? matches[0] : null;
}
