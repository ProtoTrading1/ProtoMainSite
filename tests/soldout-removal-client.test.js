import test from 'node:test';
import assert from 'node:assert/strict';
import { applyVerifiedSoldoutRemoval, soldoutRemovalMessage } from '../src/lib/checkoutReview.js';

const products = [
  { id: 'TK2154-GLD', sku: 'TK2154-GLD', code: 'QUEEN-CODE', name: '21st Birthday Key - Queen Crown', price: 428, source: 'main' },
  { id: 'TK2120-GLD', sku: 'TK2120-GLD', code: 'PRINCESS-CODE', name: '21st Birthday Key - Princess', price: 355, source: 'main' },
  { id: 'SURVIVOR', sku: 'SURVIVOR', code: 'SURVIVOR-CODE', name: 'Still available', price: 99, source: 'main' },
];
const items = products.map(product => ({ product, qty: 1 }));
const payload = items.map(item => ({ qty: item.qty, product: { id: item.product.id, sku: item.product.sku, code: item.product.code, stockRemovalSource: 'main' } }));
function change(index = 0, edits = {}) {
  const item = items[index];
  return { sku: item.product.sku, name: item.product.name, currentStockQty: 0, toOrder: false, stockOrderable: false,
    removalProof: { eligible: true, source: 'main', lineIndex: index, productId: item.product.id, sku: item.product.sku, code: item.product.code, qty: 1, preference: '' }, ...edits };
}
test('exact birthday keys removed in mixed basket; named notice derives from applied lines', () => {
  const result = applyVerifiedSoldoutRemoval(items, payload, [change(0), change(1)]);
  assert.deepEqual(result.items, [items[2]]); assert.equal(result.removedCount, 2);
  assert.deepEqual(result.changes.map(row => [row.name, row.removedFromBasket]), products.slice(0, 2).map(p => [p.name, true]));
  assert.match(soldoutRemovalMessage(2, 1), /Review your remaining items/);
  assert.equal(items.length, 3); assert.equal(payload.length, 3);
});
test('all-empty birthday key basket has truthful notice and retains input payload', () => {
  const result = applyVerifiedSoldoutRemoval(items.slice(0, 2), payload.slice(0, 2), [change(0), change(1)]);
  assert.equal(result.items.length, 0); assert.match(soldoutRemovalMessage(2, 0), /basket is now empty/);
  assert.equal(payload.length, 3);
});
for (const [name, altered] of [
  ['missing proof', change(0, { removalProof: undefined })],
  ['string proof', change(0, { removalProof: { ...change().removalProof, eligible: 'true' } })],
  ['protected orderability', change(0, { stockOrderable: true })],
  ['To Order', change(0, { toOrder: true })],
  ['unknown stock', change(0, { currentStockQty: null })],
  ['positive Stock Available', change(0, { currentStockQty: 12 })],
  ['wrong index', change(0, { removalProof: { ...change().removalProof, lineIndex: 2 } })],
  ['wrong source', change(0, { removalProof: { ...change().removalProof, source: 'instore' } })],
  ['wrong preference', change(0, { removalProof: { ...change().removalProof, preference: 'Pink' } })],
]) test(`${name} retains every line and grants no removal notice`, () => {
  const result = applyVerifiedSoldoutRemoval(items, payload, [altered]);
  assert.deepEqual(result.items, items); assert.equal(result.removedCount, 0); assert.equal(result.changes[0].removedFromBasket, false);
});
test('conflicting duplicate index changes retain instead of taking first match', () => {
  const result = applyVerifiedSoldoutRemoval(items, payload, [change(), change(0, { stockOrderable: true })]);
  assert.equal(result.removedCount, 0); assert.deepEqual(result.items, items);
});
test('same barcode on unrelated SKU cannot authorize removal', () => {
  const different = [{ product: { ...products[0], id: 'OTHER', sku: 'OTHER', code: 'TK2154-GLD' }, qty: 1 }, ...items.slice(1)];
  assert.equal(applyVerifiedSoldoutRemoval(different, payload, [change()]).removedCount, 0);
});
for (const [name, product] of [
  ['unknown legacy source', { ...products[0], source: undefined }],
  ['Instore source', { ...products[0], source: 'instore' }],
  ['contradictory source', { ...products[0], isExtendedRange: true }],
  ['local To Order', { ...products[0], toOrder: true }],
  ['local StockAvailable control', { ...products[0], StockAvailable: true }],
  ['local landed exception', { ...products[0], availability: { state: 'landed' } }],
]) test(`${name} is retained despite a server marker`, () => {
  assert.equal(applyVerifiedSoldoutRemoval([{ ...items[0], product }, ...items.slice(1)], payload, [change()]).removedCount, 0);
});
test('unmatched server claim cannot invent removedFromBasket', () => {
  const result = applyVerifiedSoldoutRemoval(items, payload, [change(0, { removedFromBasket: true, removalProof: { ...change().removalProof, lineIndex: 99 } })]);
  assert.equal(result.removedCount, 0); assert.equal(result.changes[0].removedFromBasket, false);
  assert.equal(soldoutRemovalMessage(0, 3), '');
});
