import assert from 'node:assert/strict';
import test from 'node:test';
import { searchProductAvailability } from '../lib/search-product-availability.mjs';
import { resolveProductAvailability } from '../lib/product-availability.mjs';

test('8616000132W search preserves landed label and permits an arrived-stock request without changing quantity', () => {
  const availability = resolveProductAvailability({ stockQty: -23, incoming: { incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001 } });
  const product = { sku: '8616000132W', price: 49.5, unitsOfIssue: 'Pack of 50', stockOnHand: -23, inStock: false, availability };
  assert.deepEqual(searchProductAvailability(product), { tone: 'in', label: 'Stock available', canOrder: true });
  assert.equal(product.stockOnHand, -23);
  assert.equal(product.price, 49.5);
  assert.equal(searchProductAvailability({ ...product, availability: { ...availability, label: 'Landed - being received' } }).label, 'Stock available');
});

test('flattened incoming fields and snake-case fields use shared availability', () => {
  assert.equal(searchProductAvailability({ stockQty: -23, incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001 }).label, 'Stock available');
  assert.equal(searchProductAvailability({ available_stock: 0, incoming_status: 'landed_awaiting_grv', incoming_qty: 0.001 }).label, 'Stock available');
});

test('unavailable, missing, fractional and invalid stock stay blocked; normal and To order remain buyable', () => {
  for (const raw of [0, -23, null, undefined, 'bad', 0.001]) {
    assert.equal(searchProductAvailability({ stockQty: raw }).canOrder, false);
  }
  assert.deepEqual(searchProductAvailability({ stockQty: 0 }), { tone: 'out', label: 'Out of stock', canOrder: false });
  assert.deepEqual(searchProductAvailability({ stockQty: 3 }), { tone: 'low', label: 'Low stock', canOrder: true });
  assert.deepEqual(searchProductAvailability({ stockQty: 12 }), { tone: 'in', label: 'In stock', canOrder: true });
  assert.equal(searchProductAvailability({ stockQty: -23, toOrder: true }).canOrder, true);
  assert.equal(searchProductAvailability({ stockQty: 0, availability: { state: 'incoming_preorder', label: 'On the way - pre-order', canOrder: true } }).canOrder, false);
});
