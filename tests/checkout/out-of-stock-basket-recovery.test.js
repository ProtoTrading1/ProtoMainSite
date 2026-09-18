import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  applyCheckoutReviewChanges,
  isOutOfStockReviewChange,
} from '../../src/lib/checkoutReview.js';

const appSource = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const confirmationSource = fs.readFileSync(new URL('../../src/components/OrderConfirmModal.jsx', import.meta.url), 'utf8');

const cart = [
  { qty: 1, product: { id: 'TK2154-GLD', sku: 'TK2154-GLD', price: 428, stockOnHand: 1 } },
  { qty: 2, product: { id: 'TK2120-GLD', sku: 'TK2120-GLD', price: 355, stockOnHand: 2 } },
  { qty: 3, product: { id: 'KEEP-1', sku: 'KEEP-1', price: 20, stockOnHand: 8 } },
];

test('checkout removes Yan Lin reported lines when live stock is zero or negative', () => {
  const result = applyCheckoutReviewChanges(cart, [
    { sku: 'TK2154-GLD', currentStockQty: 0, requestedQty: 1, stockChanged: true, quantityExceedsStock: true, toOrder: false },
    { sku: 'TK2120-GLD', currentStockQty: 0, requestedQty: 2, stockChanged: true, quantityExceedsStock: true, toOrder: false },
  ]);

  assert.deepEqual(result.items.map((item) => item.product.sku), ['KEEP-1']);
  assert.equal(result.removedCount, 2);
  assert.deepEqual(result.changes.map((change) => change.removedFromBasket), [true, true]);
});

test('checkout keeps positive-stock and To order lines for explicit customer review', () => {
  const result = applyCheckoutReviewChanges(cart, [
    { sku: 'KEEP-1', currentStockQty: 2, currentPrice: 21, requestedQty: 3, quantityExceedsStock: true, toOrder: false },
    { sku: 'TK2154-GLD', currentStockQty: 0, requestedQty: 1, stockUnavailable: true, toOrder: true },
  ]);

  assert.equal(result.removedCount, 0);
  assert.equal(result.items.length, 3);
  assert.equal(result.items.find((item) => item.product.sku === 'KEEP-1').product.stockOnHand, 2);
  assert.equal(result.items.find((item) => item.product.sku === 'KEEP-1').product.price, 21);
  assert.equal(isOutOfStockReviewChange({ currentStockQty: 0, toOrder: true }), false);
  assert.equal(isOutOfStockReviewChange({ currentStockQty: null, stockUnavailable: true, toOrder: false }), false);
});

test('customer is told why products were removed and sees every affected product name', () => {
  assert.match(appSource, /The following items were removed because they are currently out of stock/);
  assert.match(appSource, /Your other items are still in your basket/);
  assert.match(confirmationSource, /<strong>\{change\.name\}<\/strong>/);
  assert.match(confirmationSource, /Removed from basket — out of stock/);
});
