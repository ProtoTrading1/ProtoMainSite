import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { instorePage } from '../lib/instore-page.mjs';
import { prepareInstoreSearch } from '../lib/instore-discovery.mjs';
import { searchProducts } from './fixtures/instore-search-products.mjs';

// Captured with the pre-optimization production implementation at e77f275.
// Freezes membership, rank, totals and paging rather than comparing two callers
// of the new implementation to one another.
const contracts = JSON.parse(readFileSync(new URL('./fixtures/instore-search-contracts.json', import.meta.url)));

test('compiled search preserves pre-optimization results across language, identifiers, categories and pages', () => {
  const products = searchProducts();
  const originalOrder = [...products];
  for (const { options, total, from, skus } of contracts) {
    const actual = instorePage(products, options);
    assert.deepEqual({ total: actual.total, from: actual.from, skus: actual.products.map(p => p.sku) },
      { total, from, skus }, JSON.stringify(options));
  }
  assert.deepEqual(products, originalOrder, 'search cannot reorder the underlying catalogue');
});

test('prepared searches keep independent query state and use refreshed product fields', () => {
  const products = searchProducts();
  const bracelets = prepareInstoreSearch('bracelets under R50');
  const hair = prepareInstoreSearch('hair clips');
  assert.equal(bracelets.matches(products[0]), true);
  assert.equal(hair.matches(products[0]), false);
  assert.equal(hair.matches(products[3]), true);
  assert.equal(bracelets.matches({ ...products[0], price: 60 }), false);
  const refreshed = { ...products[0], name: 'HAIR CLIP', originalDescription: 'HAIR CLIP' };
  assert.equal(bracelets.matches(refreshed), false);
  assert.equal(hair.matches(refreshed), true);
});
