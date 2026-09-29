import test from 'node:test';
import assert from 'node:assert/strict';

import { getSuggestions, prepareSearchIndex } from '../../src/lib/fuzzySearch.js';

const products = [
  { id: 'wallet', code: '60010001', barcode: '60010001', sku: 'WA100', websiteSku: 'WA100', name: 'Ladies Wallet', stockOnHand: 20 },
  { id: 'bear', code: 'ST200', name: 'Soft Toy Bear', stockOnHand: 12 },
  { id: 'stationery', code: 'PN300', name: 'Stationery Pen Set', stockOnHand: 8 },
  { id: 'oos-bag', code: 'BG400', name: 'Gift Bag', stockOnHand: 0 },
  { id: 'live-bag', code: 'BG401', name: 'Gift Bag', stockOnHand: 10 },
  { id: 'mkt-item', code: '70010002', barcode: '70010002', sku: 'MKT250', websiteSku: 'MKT250', name: 'Display Hooks', stockOnHand: 15 },
  { id: 'hair-clip', code: 'HC500', name: 'Hair Clip Assorted', stockOnHand: 18 },
  { id: 'phone-case', code: 'PC600', name: 'Mobile Phone Case', stockOnHand: 22 },
];

prepareSearchIndex(products);

test('expands Proto-specific customer language', () => {
  assert.equal(getSuggestions(products, 'purse', 5)[0]?.id, 'wallet');
  assert.equal(getSuggestions(products, 'teddy', 5)[0]?.id, 'bear');
  assert.equal(getSuggestions(products, 'stationary', 5)[0]?.id, 'stationery');
});

test('keeps exact identifier lookup ahead of fuzzy text matches', () => {
  assert.equal(getSuggestions(products, 'BG400', 5)[0]?.id, 'oos-bag');
});

test('searches website SKU and barcode as equal first-class identifiers', () => {
  assert.equal(getSuggestions(products, 'WA100', 5)[0]?.id, 'wallet');
  assert.equal(getSuggestions(products, '60010001', 5)[0]?.id, 'wallet');
});

test('searches from a three-letter SKU prefix', () => {
  assert.equal(getSuggestions(products, 'mkt', 5)[0]?.id, 'mkt-item');
});

test('ranks available stock ahead when relevance is equal', () => {
  assert.equal(getSuggestions(products, 'gift bag', 5)[0]?.id, 'live-bag');
});

test('recovers an adjacent-letter typo', () => {
  assert.equal(getSuggestions(products, 'walelt', 5)[0]?.id, 'wallet');
});

test('uses the shared customer-language families across the main catalogue', () => {
  for (const query of ['plush', 'stuffed animal', 'cuddly toy', 'pluch', 'tedi']) {
    assert.equal(getSuggestions(products, query, 5)[0]?.id, 'bear', query);
  }
  assert.equal(getSuggestions(products, 'barrette', 5)[0]?.id, 'hair-clip');
  assert.equal(getSuggestions(products, 'cellphone case', 5)[0]?.id, 'phone-case');
});
