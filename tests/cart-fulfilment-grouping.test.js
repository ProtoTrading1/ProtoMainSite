import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { groupCartItemsByFulfilment, isMadeToOrderProduct } from '../lib/cart-fulfilment.mjs';

test('only explicit made-to-order products enter the to-order group', () => {
  assert.equal(isMadeToOrderProduct({ availability: { state: 'to_order', canOrder: true } }), true);
  assert.equal(isMadeToOrderProduct({ toOrder: true }), true);
  assert.equal(isMadeToOrderProduct({ availability: { state: 'in_stock', canOrder: true } }), false);
  assert.equal(isMadeToOrderProduct({ availability: { state: 'landed', canOrder: true } }), false);
  assert.equal(isMadeToOrderProduct({ availability: { state: 'incoming_preorder', canOrder: true } }), false);
});

test('checkout keeps available lines first and made-to-order lines last', () => {
  const available = { product: { id: 'stock', availability: { state: 'in_stock' } }, qty: 1 };
  const toOrder = { product: { id: 'made', availability: { state: 'to_order' } }, qty: 2 };
  const lowStock = { product: { id: 'low', availability: { state: 'low_stock' } }, qty: 3 };

  const grouped = groupCartItemsByFulfilment([toOrder, available, lowStock]);
  assert.deepEqual(grouped.available, [available, lowStock]);
  assert.deepEqual(grouped.toOrder, [toOrder]);
});

test('checkout explains the separated to-order section before submission', () => {
  const checkoutSource = fs.readFileSync(new URL('../src/components/CheckoutModal.jsx', import.meta.url), 'utf8');
  assert.match(checkoutSource, /Available products/);
  assert.match(checkoutSource, /Not currently in stock/);
  assert.match(checkoutSource, /lead time confirmed before invoicing/);
  assert.match(checkoutSource, /We’ll confirm the expected lead time before invoicing\. No payment is taken now\./);
});
