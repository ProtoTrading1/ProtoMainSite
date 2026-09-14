import test from 'node:test';
import assert from 'node:assert/strict';
import { searchInstoreProducts } from '../lib/instore-discovery.mjs';

const products = [
  { sku: '8618100100', title: 'WOODEN BRACELET', category: 'JEWELLERY' },
  { sku: '8626100117', title: 'SOFT TOY GIRAFFE', category: 'SOFT TOYS' },
  { sku: '8630000011', title: 'LEATHER WALLET', category: 'BAGS WALLETS' },
];
test('Instore uses main search spelling and everyday-word matching', () => {
  assert.equal(searchInstoreProducts(products, 'braclet')[0], products[0]);
  assert.equal(searchInstoreProducts(products, 'teddy')[0], products[1]);
  assert.equal(searchInstoreProducts(products, 'purse')[0], products[2]);
});
test('exact codes return the original product and wrong codes do not guess', () => {
  assert.deepEqual(searchInstoreProducts(products, '8618100100'), [products[0]]);
  assert.deepEqual(searchInstoreProducts(products, '8618100199'), []);
});
test('unrelated words do not invent matches', () => {
  assert.deepEqual(searchInstoreProducts(products, 'refrigerator'), []);
});
