import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withChristmasPenGroup } from '../api/_christmas-pen-group.js';
import { groupProductsByBarcode, expandBarcodeSiblings, spotlightChristmasPenCode } from '../src/lib/productGroups.js';

test('ten exact Christmas pen SKUs form a single group without changing unrelated groups', () => {
  const existing = new Map([['OTHER', { groupId: 'existing' }]]);
  const map = withChristmasPenGroup(existing);
  assert.equal(map.size, 11);
  assert.deepEqual(map.get('OTHER'), { groupId: 'existing' });
  const skus = Array.from({ length: 10 }, (_, i) => String(8622000154 + i));
  const products = skus.map((sku) => ({ id: sku, sku, barcode: sku, name: map.get(sku).variantLabel, image: `${sku}.jpg`, ...map.get(sku) }));
  const result = groupProductsByBarcode(products);
  assert.equal(result.length, 1);
  assert.equal(result[0].variantCount, 10);
  assert.equal(result[0].primaryVariantId, '8622000156');
  assert.deepEqual(new Set(result[0].variants.map((v) => v.sku)), new Set(skus));
  const expanded = expandBarcodeSiblings(products, [products[0]]);
  assert.equal(expanded.length, 10);
  assert.equal(existing.size, 1);
});

test('an existing admin assignment is not overwritten or split', () => {
  const existing = new Map([['8622000154', { groupId: 'admin-group' }]]);
  assert.equal(withChristmasPenGroup(existing), existing);
  assert.equal(existing.size, 1);
});

test('exact pen code highlights the matching card without changing the variants or primary', () => {
  const map = withChristmasPenGroup(null);
  const products = [...map].map(([sku, info]) => ({ id: sku, sku, code: sku, barcode: sku, name: info.variantLabel, description: `Description for ${sku}`, image: `${sku}.jpg`, price: 9.5, ...info }));
  const group = groupProductsByBarcode(products)[0];
  const [result] = spotlightChristmasPenCode([group], '8622000161');
  assert.equal(result.name, 'Truck with gifts');
  assert.equal(result.sku, '8622000161');
  assert.equal(result.websiteSku, '8622000161');
  assert.equal(result.description, 'Description for 8622000161');
  assert.equal(result.code, '8622000161');
  assert.equal(result.image, '8622000161.jpg');
  assert.equal(result.images[0], '8622000161.jpg');
  assert.equal(result.primaryVariantId, '8622000156');
  assert.equal(result.variants.length, 10);
  assert.equal(spotlightChristmasPenCode([group], '8622000161 extra')[0], group);
  assert.equal(spotlightChristmasPenCode([group], '8622000199')[0], group);
});
