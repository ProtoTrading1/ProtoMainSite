import assert from 'node:assert/strict';
import test from 'node:test';
import { addBasketLine, basketLineKey, basketLineQuantityLimit, basketProductQuantity, mergeBasketLines, removeBasketLine, updateBasketLineQuantity } from '../lib/basket-lines.mjs';
import { cartPayload, parseCartMutation } from '../api/account-cart.js';

const product = { id: 'SKU-COLOURS', isExtendedRange: true, minQty: 1, stockQty: 10 };
const line = (preference, qty, extra = {}) => ({ product: { ...product, ...extra }, preference, qty });
const cap = (item) => item.stockQty;

test('canonical identifiers match API fallback rules for blank identifiers and numeric zero', () => {
  assert.equal(basketLineKey({ product: { id: ' ', sku: ' fallback ' } }), basketLineKey({ product: { id: 'FALLBACK' } }));
  assert.equal(basketLineKey({ product: { id: 0 } }), basketLineKey({ product: { id: '0' } }));
});

test('editing/removing one same-SKU preference preserves its sibling and original input', () => {
  const original = [line('Red', 2), line('blue', 3)];
  const redKey = basketLineKey(original[0]);
  const edited = updateBasketLineQuantity(original, redKey, 6, cap);
  assert.deepEqual(edited.map(({ qty }) => qty), [6, 3]);
  assert.deepEqual(original.map(({ qty }) => qty), [2, 3]);
  assert.equal(basketLineQuantityLimit(edited, edited[0], cap), 7);
  const capped = updateBasketLineQuantity(edited, redKey, 9, cap);
  assert.deepEqual(capped.map(({ qty }) => qty), [7, 3]);
  assert.equal(basketProductQuantity(capped, product), 10);
  assert.deepEqual(removeBasketLine(capped, redKey), [capped[1]]);
});

test('canonical product/preference identity merges casing and whitespace without dropping quantity or display text', () => {
  const originals = [line(' Dark  blue ', 2), line('dark blue', 3, { id: ' sku-colours ' }), line('red', 1)];
  assert.equal(basketLineKey(originals[0]), basketLineKey(originals[1]));
  const merged = mergeBasketLines(originals);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].qty, 5);
  assert.equal(merged[0].preference, 'Dark  blue');
  assert.equal(merged[1].qty, 1);
  assert.equal(originals[0].qty, 2);
  assert.equal(mergeBasketLines([line('RED', 6000), line('red', 6000)])[0].qty, 12000);
});

test('new additions and reorders use aggregate SKU stock and shared preference identity', () => {
  const existing = [line('Red', 2), line('blue', 3)];
  const red = addBasketLine(existing, line('red', 4), { quantityCapForProduct: cap });
  assert.equal(red.items.length, 2);
  assert.equal(red.items[0].preference, 'Red');
  assert.equal(red.items[0].qty, 6);
  const green = addBasketLine(red.items, line('green', 4), { quantityCapForProduct: cap });
  assert.equal(green.addedQty, 1);
  assert.equal(green.reason, 'stock_limit');
  assert.equal(basketProductQuantity(green.items, product), 10);
  assert.equal(addBasketLine(green.items, line('yellow', 1), { quantityCapForProduct: cap }).addedQty, 0);
});

test('line ceiling permits additions to existing preferences and rejects only new lines', () => {
  const lines = [line('red', 2), line('blue', 2)];
  assert.equal(addBasketLine(lines, line('RED', 1), { quantityCapForProduct: cap, maxLines: 2 }).addedQty, 1);
  const blocked = addBasketLine(lines, line('green', 1), { quantityCapForProduct: cap, maxLines: 2 });
  assert.equal(blocked.reason, 'line_limit');
  assert.deepEqual(blocked.items, lines);
});

test('stock refresh does not delete an existing line whose siblings consume available stock', () => {
  const lines = [line('red', 2, { stockQty: 3 }), line('blue', 3, { stockQty: 3 })];
  const edited = updateBasketLineQuantity(lines, basketLineKey(lines[0]), 4, cap);
  assert.deepEqual(edited, lines);
});

test('account reads repair legacy canonical collisions; saves remain strict after client normalization', () => {
  const now = 1800000000000;
  const legacy = [line('Red', 2), line('red', 3), line('blue', 1)];
  const payload = cartPayload({ items: legacy, activity_at: now, revision: 7 });
  assert.equal(payload.revision, 7);
  assert.equal(payload.activityAt, now);
  assert.deepEqual(payload.items.map(({ qty, preference }) => ({ qty, preference })), [
    { qty: 5, preference: 'Red' }, { qty: 1, preference: 'blue' },
  ]);
  const saved = parseCartMutation({ mode: 'save', revision: 7, activityAt: now, items: mergeBasketLines(legacy) }, { now });
  assert.deepEqual(saved.items.map(({ qty }) => qty), [5, 1]);
  assert.throws(() => parseCartMutation({ mode: 'save', revision: 7, activityAt: now, items: legacy }, { now }), { status: 400 });
  const oversized = cartPayload({ items: [line('Red', 6000), line('red', 6000)], activity_at: now, revision: 7 });
  assert.equal(oversized.items[0].qty, 12000);
  assert.throws(() => parseCartMutation({ mode: 'save', revision: 7, activityAt: now, items: oversized.items }, { now }), { status: 400 });
});
