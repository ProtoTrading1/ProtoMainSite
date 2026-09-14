import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkoutSnapshotForProduct,
  evaluateCheckoutSnapshot,
  isToOrderProduct,
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
