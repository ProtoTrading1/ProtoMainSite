import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TURTLE_BRACELET_COLOURS, withTurtleBraceletPhoto } from '../lib/kbra2013-colours.mjs';
import { addBasketLine, basketProductQuantity } from '../lib/basket-lines.mjs';

test('the four images exist, default to brown, and leave other products alone', async () => {
  assert.deepEqual(TURTLE_BRACELET_COLOURS.map(option => option.label), ['Brown', 'Black', 'Turquoise', 'White']);
  for (const { image } of TURTLE_BRACELET_COLOURS) assert.ok((await readFile(new URL(`../public${image}`, import.meta.url))).length > 10000);
  const item = { sku: 'KBRA2013', id: 'KBRA2013', image: '/old.jpg', stockQty: 58 };
  assert.match(withTurtleBraceletPhoto(item).image, /2013brn\.jpg$/);
  assert.match(withTurtleBraceletPhoto(item, 'White').image, /2013whi\.jpg$/);
  assert.equal(item.image, '/old.jpg');
  const other = { sku: 'KBRA20130', image: '/other.jpg' };
  assert.equal(withTurtleBraceletPhoto(other, 'Black'), other);
});

test('all four colour requests share KBRA2013 stock', () => {
  const product = { id: 'KBRA2013', sku: 'KBRA2013', minQty: 1, stockQty: 58 };
  let items = [];
  for (const { label } of TURTLE_BRACELET_COLOURS) {
    items = addBasketLine(items, { product: withTurtleBraceletPhoto(product, label), preference: label, qty: 15 }, { quantityCapForProduct: p => p.stockQty }).items;
  }
  assert.deepEqual(items.map(line => [line.preference, line.qty]), [['Brown', 15], ['Black', 15], ['Turquoise', 15], ['White', 13]]);
  assert.equal(basketProductQuantity(items, product), 58);
});
