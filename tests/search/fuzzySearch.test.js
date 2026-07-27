import test from 'node:test';
import assert from 'node:assert/strict';

import { getSuggestions, prepareSearchIndex } from '../../src/lib/fuzzySearch.js';

const products = [
  { id: 'wallet', code: 'WA100', name: 'Ladies Wallet', stockOnHand: 20 },
  { id: 'bear', code: 'ST200', name: 'Soft Toy Bear', stockOnHand: 12 },
  { id: 'stationery', code: 'PN300', name: 'Stationery Pen Set', stockOnHand: 8 },
  { id: 'oos-bag', code: 'BG400', name: 'Gift Bag', stockOnHand: 0 },
  { id: 'live-bag', code: 'BG401', name: 'Gift Bag', stockOnHand: 10 },
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

test('ranks available stock ahead when relevance is equal', () => {
  assert.equal(getSuggestions(products, 'gift bag', 5)[0]?.id, 'live-bag');
});

test('recovers an adjacent-letter typo', () => {
  assert.equal(getSuggestions(products, 'walelt', 5)[0]?.id, 'wallet');
});
