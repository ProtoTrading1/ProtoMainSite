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

function productKeys(product = {}) {
  return [product.id, product.sku, product.code]
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean);
}

function reviewKey(change = {}) {
  return String(change.sku || '').trim().toUpperCase();
}

export function isOutOfStockReviewChange(change = {}) {
  if (change.toOrder) return false;
  return Number.isFinite(change.currentStockQty) && change.currentStockQty <= 0;
}

export function applyCheckoutReviewChanges(cartItems = [], changes = []) {
  const reviewChanges = changes.map((change) => ({
    ...change,
    removedFromBasket: isOutOfStockReviewChange(change),
  }));
  let removedCount = 0;

  const items = cartItems.flatMap((item) => {
    const keys = productKeys(item.product);
    const change = reviewChanges.find((candidate) => {
      const key = reviewKey(candidate);
      return key && keys.includes(key);
    });
    if (!change) return [item];
    if (change.removedFromBasket) {
      removedCount += 1;
      return [];
    }
    return [{
      ...item,
      product: {
        ...item.product,
        ...(Number.isFinite(change.currentPrice) ? { price: change.currentPrice } : {}),
        ...(Number.isFinite(change.currentStockQty)
          ? { stockOnHand: change.currentStockQty, stockQty: change.currentStockQty }
          : {}),
      },
    }];
  });

  return { items, changes: reviewChanges, removedCount };
}
