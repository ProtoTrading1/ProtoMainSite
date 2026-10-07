import { normalizeItemPreference } from '../../lib/item-preference.mjs';
import { isToOrderProduct } from '../../lib/order-stock-guard.mjs';

const STREET_HINT = /\d|\b(?:building|centre|center|corner|cnr|estate|farm|plot|shop|stand|unit)\b/i;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getDeliveryAddressReview(customer = {}) {
  const structured = [
    clean(customer.unit_number) ? `Unit ${clean(customer.unit_number)}` : '',
    clean(customer.street_name),
    clean(customer.suburb),
    clean(customer.city),
    clean(customer.postal_code),
    clean(customer.province),
    clean(customer.country),
  ].filter(Boolean);
  const savedAddress = clean(customer.delivery_address);
  const value = savedAddress || structured.join(', ') || 'To confirm with Proto';

  const hasStructuredAddress = [
    customer.street_name,
    customer.suburb,
    customer.city,
    customer.postal_code,
  ].some((part) => clean(part));

  const complete = hasStructuredAddress
    ? Boolean(
      clean(customer.street_name)
      && clean(customer.suburb)
      && clean(customer.city)
      && clean(customer.postal_code),
    )
    : Boolean(
      savedAddress
      && savedAddress.split(',').filter((part) => clean(part)).length >= 3
      && STREET_HINT.test(savedAddress),
    );

  return {
    value,
    complete,
    warning: complete
      ? ''
      : 'This delivery address may be incomplete. Before choosing Proto delivery, add the street address, suburb and postal code in My Profile, or include the full address in your delivery notes.',
  };
}

// Deletion never uses the old SKU/barcode OR matcher. The server binds a
// verified Main zero-stock observation to one exact submitted line. Unknown
// sources, conflicting changes and ordering exceptions retain the line.
export function applyVerifiedSoldoutRemoval(items, payloadItems, changes) {
  const rows = Array.isArray(changes) ? changes : [];
  const marked = rows.map(change => ({ ...change, removedFromBasket: false }));
  if (!Array.isArray(items) || !Array.isArray(payloadItems) || items.length !== payloadItems.length) {
    return { items, changes: marked, removedCount: 0 };
  }
  const identity = value => value === undefined || value === null ? '' : String(value);
  const counts = new Map();
  for (const change of rows) {
    const index = change?.removalProof?.lineIndex;
    if (Number.isSafeInteger(index)) counts.set(index, (counts.get(index) || 0) + 1);
  }
  const removed = new Set();
  rows.forEach((change, changeIndex) => {
    const proof = change?.removalProof;
    const index = proof?.lineIndex;
    if (proof?.eligible !== true || proof.source !== 'main' || !Number.isSafeInteger(index)
      || index < 0 || index >= items.length || counts.get(index) !== 1
      || change.toOrder !== false || change.stockOrderable !== false || change.currentStockQty !== 0) return;
    const item = items[index], submitted = payloadItems[index];
    const product = item?.product;
    if (product?.source !== 'main' || product.isExtendedRange === true || isToOrderProduct(product)
      || product.StockAvailable === true || product.stockAvailable === true
      || ['landed', 'incoming_preorder', 'to_order'].includes(product.availability?.state)
      || submitted?.product?.stockRemovalSource !== 'main'
      || proof.qty !== item.qty || proof.qty !== submitted.qty
      || proof.preference !== normalizeItemPreference(item.preference)
      || proof.preference !== normalizeItemPreference(submitted.preference)) return;
    for (const [field, proofField] of [['id', 'productId'], ['sku', 'sku'], ['code', 'code']]) {
      if (proof[proofField] !== identity(product[field]) || proof[proofField] !== identity(submitted.product[field])) return;
    }
    if (!proof.sku || identity(change.sku).trim().toUpperCase() !== proof.sku.trim().toUpperCase()) return;
    removed.add(index);
    marked[changeIndex] = { ...change, name: product.name || change.name, removedFromBasket: true };
  });
  return { items: items.filter((_, index) => !removed.has(index)), changes: marked, removedCount: removed.size };
}

export function soldoutRemovalMessage(removedCount, remainingCount) {
  if (!removedCount) return '';
  return `${removedCount} sold-out ${removedCount === 1 ? 'item was' : 'items were'} removed from your basket. ${remainingCount
    ? 'Review your remaining items before sending your order request.'
    : 'Your basket is now empty.'}`;
}
