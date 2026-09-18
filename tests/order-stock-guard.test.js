import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  aggregateRequestedQuantities,
  checkoutSnapshotForProduct,
  evaluateCheckoutSnapshot,
  isStockOrderableAvailability,
  isToOrderProduct,
  mergeCheckoutReviewChanges,
  normaliseStockQty,
} from '../lib/order-stock-guard.mjs';

const sendOrderSource = fs.readFileSync(new URL('../api/send-order.js', import.meta.url), 'utf8');

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
    stockOrderable: false,
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

test('approved landed and incoming preorder lines are not constrained by physical stock', () => {
  assert.equal(isStockOrderableAvailability({ state: 'landed', canOrder: true }), true);
  assert.equal(isStockOrderableAvailability({ state: 'incoming_preorder', canOrder: true }), true);
  assert.equal(isStockOrderableAvailability({ state: 'incoming', canOrder: false }), false);
  assert.equal(isStockOrderableAvailability({ state: 'out_of_stock', canOrder: false }), false);
  assert.equal(evaluateCheckoutSnapshot({
    sku: 'INCOMING-1',
    name: 'Incoming product',
    quantity: 5,
    stockOrderable: true,
    submittedSnapshot: { unitPrice: 10, stockQty: 0 },
    currentPrice: 10,
    currentStockQty: 0,
  }), null);
  const totals = aggregateRequestedQuantities([
    { sku: 'INCOMING-1', quantity: 5, stockOrderable: true },
  ]);
  assert.equal(totals.has('INCOMING-1'), false);
});

test('duplicate preference lines share one authoritative SKU stock ceiling', () => {
  const totals = aggregateRequestedQuantities([
    { sku: 'DUP-1', quantity: 2, isToOrder: false },
    { sku: 'dup-1', quantity: 2, isToOrder: false },
    { sku: 'ORDER-1', quantity: 100, isToOrder: true },
  ]);

  assert.equal(totals.get('DUP-1'), 4);
  assert.equal(totals.has('ORDER-1'), false);
  const review = evaluateCheckoutSnapshot({
    sku: 'DUP-1',
    name: 'Preference product',
    quantity: totals.get('DUP-1'),
    submittedSnapshot: { unitPrice: 10, stockQty: 3 },
    currentPrice: 10,
    currentStockQty: 3,
  });
  assert.equal(review.quantityExceedsStock, true);
  assert.equal(review.requestedQty, 4);
});

test('duplicate SKU review rows are merged into one customer-facing change', () => {
  const merged = mergeCheckoutReviewChanges([
    {
      sku: 'DUP-1', requestedQty: 4, previousPrice: 10, currentPrice: 10,
      previousStockQty: 3, currentStockQty: 3, priceChanged: false,
      stockChanged: false, stockUnavailable: false, quantityExceedsStock: true,
    },
    {
      sku: 'dup-1', requestedQty: 4, previousPrice: 10, currentPrice: 10,
      previousStockQty: 3, currentStockQty: 3, priceChanged: false,
      stockChanged: false, stockUnavailable: false, quantityExceedsStock: true,
    },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].requestedQty, 4);
  assert.equal(merged[0].quantityExceedsStock, true);
});

test('the authoritative checkout API applies the combined SKU quantity before capture', () => {
  assert.match(sendOrderSource, /aggregateRequestedQuantities\(items\.map/);
  assert.match(sendOrderSource, /requestedQtyBySku\.get\(String\(row\.sku/);
  assert.match(sendOrderSource, /mergeCheckoutReviewChanges\(reviewChanges\)/);
});
