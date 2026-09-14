import test from 'node:test';
import assert from 'node:assert/strict';
import { searchInstoreProducts } from '../lib/instore-discovery.mjs';
import { classifyInstoreProduct } from '../lib/instore-classification.mjs';

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

const jewellery = [
  { sku: '100001', title: 'BRACELET CHAIN', category: 'BEAD ACCESSORIES' },
  { sku: '100002', title: 'BRACELET BOX', category: 'PACKAGING GOODS' },
  { sku: '100003', title: 'BRACELET BRAIDING BOARD', category: 'BEAD ACCESSORIES' },
  { sku: '100004', title: 'WOODEN BRACELET', category: 'JEWELLERY' },
  { sku: '100005', title: 'BEADED BRACELET', category: 'BEAD ACCESSORIES' },
  { sku: '100006', title: 'NECKLACE DISPLAY', category: 'PACKAGING GOODS' },
  { sku: '100007', title: 'PEARL NECKLACE', category: 'JEWELLERY' },
  { sku: '100008', title: 'EARRING HOOKS', category: 'BEAD METAL PARTS' },
  { sku: '100009', title: 'PEARL EARRING', category: 'JEWELLERY' },
];

test('general bracelet searches lead with finished pieces and retain accessories', () => {
  for (const query of ['bracelet', 'braclet', 'bracelets', 'bracleet']) {
    const result = searchInstoreProducts(jewellery, query);
    assert.deepEqual(result.slice(0, 2), [jewellery[3], jewellery[4]], query);
    assert.equal(result.length, 5, query);
    assert.equal(new Set(result).size, 5, query);
    for (const accessory of jewellery.slice(0, 3)) assert.ok(result.includes(accessory), query);
  }
});

test('general necklace and earring searches promote finished pieces, including typos', () => {
  for (const query of ['necklace', 'necklce', 'necklaces']) {
    assert.equal(searchInstoreProducts(jewellery, query)[0], jewellery[6], query);
  }
  for (const query of ['earring', 'earrings', 'earing']) {
    assert.equal(searchInstoreProducts(jewellery, query)[0], jewellery[8], query);
  }
});

test('explicit packaging and component queries still find the requested accessory', () => {
  for (const [query, index] of [['bracelet box', 1], ['braclet box', 1], ['bracelet chain', 0],
    ['bracelet braiding board', 2], ['necklace display', 5], ['earring hooks', 7]]) {
    assert.deepEqual(searchInstoreProducts(jewellery, query), [jewellery[index]], query);
  }
});

test('ranking does not change identifiers, classifications or source objects', () => {
  const before = structuredClone(jewellery);
  const classifications = jewellery.map(classifyInstoreProduct);
  for (const product of jewellery) {
    assert.deepEqual(searchInstoreProducts(jewellery, product.sku), [product]);
  }
  searchInstoreProducts(jewellery, 'braclet');
  assert.deepEqual(jewellery, before);
  assert.deepEqual(jewellery.map(classifyInstoreProduct), classifications);
});

test('an exact alphabetic accessory identifier retains priority over finished jewellery', () => {
  const accessory = { sku: 'BRACLET', title: 'BRACELET BOX', category: 'PACKAGING GOODS' };
  assert.equal(searchInstoreProducts([jewellery[3], accessory], 'braclet')[0], accessory);
});
