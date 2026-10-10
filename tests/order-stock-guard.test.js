import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkoutSnapshotForProduct,
  evaluateCheckoutSnapshot,
  isToOrderProduct,
  isLandedStockAvailable,
  normaliseStockQty,
} from '../lib/order-stock-guard.mjs';

test('ordinary products are capped to whole current stock while To order remains the exception', () => {
  assert.equal(normaliseStockQty(4.9), 4);
  assert.equal(normaliseStockQty(-2), 0);
  assert.equal(normaliseStockQty(null), null);
  assert.equal(isToOrderProduct({ toOrder: true }), true);
  assert.equal(isToOrderProduct({ availability: { canOrder: true } }), false);
  assert.deepEqual(checkoutSnapshotForProduct({ price: 19.995, stockOnHand: 6 }), {
    unitPrice: 20,
    stockQty: 6,
  });
});

test('confirmed arrived-stock requests bypass only a nonpositive recorded cap, never a price review', () => {
  const availability = { state: 'landed', canOrder: true, stockQty: -23, incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001 };
  const input = { sku: '8616000132W', quantity: 52, submittedSnapshot: { unitPrice: 49.5, stockQty: 0 }, currentPrice: 49.5, currentStockQty: -23, currentAvailability: availability };
  assert.equal(isLandedStockAvailable(availability), true);
  assert.equal(evaluateCheckoutSnapshot(input), null);
  assert.equal(evaluateCheckoutSnapshot({ ...input, currentPrice: 50 }).priceChanged, true);
  for (const change of [{ canOrder: false }, { canOrder: undefined }, { incomingQty: 0 }, { incomingQty: undefined }, { incomingStatus: 'partially_received' }, { incomingStatus: 'customs' }, { state: undefined }]) {
    const currentAvailability = { ...availability, ...change };
    assert.equal(isLandedStockAvailable(currentAvailability), false);
    assert.equal(evaluateCheckoutSnapshot({ ...input, currentAvailability }).quantityExceedsStock, true);
  }
  assert.equal(isLandedStockAvailable({ ...availability, stockQty: null }), false);
  assert.equal(isLandedStockAvailable({ ...availability, stockQty: 2 }), false);
  assert.equal(evaluateCheckoutSnapshot({ ...input, currentStockQty: 2 }).quantityExceedsStock, true);
  assert.equal(isLandedStockAvailable({ stockQty: -23, availability, isExtendedRange: true }), false);
  assert.equal(evaluateCheckoutSnapshot({ ...input, currentAvailability: null }).quantityExceedsStock, true, 'browser supplied flags do not grant the server exception');
});

test('checkout requires review when an ordinary line price, stock, or requested quantity changed', () => {
  const review = evaluateCheckoutSnapshot({
    sku: 'ABC',
    name: 'Example item',
    quantity: 5,
    submittedSnapshot: { unitPrice: 10, stockQty: 6 },
    currentPrice: 12,
    currentStockQty: 3,
  });
  assert.deepEqual(review, {
    sku: 'ABC',
    name: 'Example item',
    toOrder: false,
    requestedQty: 5,
    previousPrice: 10,
    currentPrice: 12,
    previousStockQty: 6,
    currentStockQty: 3,
    priceChanged: true,
    stockChanged: true,
    stockUnavailable: false,
    quantityExceedsStock: true,
  });
});

test('To order lines still detect a changed price but never fail for on-hand stock', () => {
  assert.equal(evaluateCheckoutSnapshot({
    sku: 'ORDER-1',
    name: 'Sourced item',
    quantity: 100,
    isToOrder: true,
    submittedSnapshot: { unitPrice: 10, stockQty: 0 },
    currentPrice: 10,
    currentStockQty: 0,
  }), null);
});
