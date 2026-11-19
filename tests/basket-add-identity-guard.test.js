import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addBasketLine, basketProductKey, newBasketProductKey, hasNewInvalidBasketIdentity } from '../lib/basket-lines.mjs';
import { cartPayload, parseCartMutation } from '../api/account-cart.js';

const line = (product, qty = 1, preference = '') => ({ product, qty, preference });
const options = { quantityCapForProduct: () => 100 };
const leaf = { id: 'LEAF-RED', sku: 'LEAF-RED', code: 'BASE', barcode: 'BASE', price: 12 };

test('new adds reject malformed identity without falling back to a sibling SKU or mutating the basket', () => {
  const items = [line(leaf, 2)];
  const before = structuredClone(items);
  for (const id of [{ sku: 'LEAF-RED' }, [], true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '[OBJECT OBJECT]', ' [ object Object ] ', 'object object']) {
    const result = addBasketLine(items, line({ ...leaf, id }), options);
    assert.equal(result.reason, 'invalid_identity');
    assert.equal(result.addedQty, 0);
    assert.equal(result.items, items);
  }
  for (const field of ['sku', 'code', 'websiteSku']) {
    assert.equal(newBasketProductKey({ ...leaf, [field]: '[OBJECT OBJECT]' }), '');
  }
  assert.deepEqual(items, before);
  assert.equal(newBasketProductKey({ id: ' ', sku: 'LEAF-RED' }), 'LEAF-RED');
  assert.equal(newBasketProductKey({ id: 0 }), '0');
});

test('only selected leaf identity is added; valid same-barcode variants and preferences stay separate', () => {
  assert.equal(addBasketLine([], line({ ...leaf, isVariantGroup: true, variants: [leaf] }), options).addedQty, 0);
  let items = [];
  for (const [product, preference] of [[leaf, 'Red'], [leaf, 'Blue'], [{ ...leaf, id: 'LEAF-BLUE', sku: 'LEAF-BLUE' }, 'Red']]) {
    const result = addBasketLine(items, line(product, 2, preference), options);
    assert.equal(result.addedQty, 2);
    items = result.items;
  }
  assert.equal(items.length, 3);
  assert.deepEqual(items.map(({ product }) => product.sku), ['LEAF-RED', 'LEAF-RED', 'LEAF-BLUE']);
});

test('legacy literal lines remain readable and saveable without permitting new malformed additions', () => {
  const legacy = line({ id: '[OBJECT OBJECT]', sku: '[OBJECT OBJECT]', code: 'LEGACY', price: 12 }, 3, 'Existing preference');
  const stored = cartPayload({ items: [legacy], revision: 5, activity_at: new Date().toISOString() });
  assert.equal(basketProductKey(stored.items[0].product), '[OBJECT OBJECT]');
  const parsed = parseCartMutation({ mode: 'save', items: stored.items, revision: 5, activityAt: Date.now() });
  assert.equal(hasNewInvalidBasketIdentity(parsed.items, stored.items), false);
  assert.equal(hasNewInvalidBasketIdentity([...parsed.items, line(leaf)], stored.items), false);
  assert.equal(hasNewInvalidBasketIdentity([{ ...parsed.items[0], qty: 2 }], stored.items), false);
  assert.equal(hasNewInvalidBasketIdentity([], stored.items), false);
  assert.equal(hasNewInvalidBasketIdentity(parsed.items, []), true);
  assert.equal(hasNewInvalidBasketIdentity([{ ...parsed.items[0], qty: 4 }], stored.items), true);
  assert.equal(hasNewInvalidBasketIdentity([{ ...parsed.items[0], preference: 'Guessed replacement' }], stored.items), true);
  assert.throws(() => parseCartMutation({ mode: 'save', items: [line({ ...leaf, id: {} })], revision: 0, activityAt: Date.now() }), /must be text/);
});
