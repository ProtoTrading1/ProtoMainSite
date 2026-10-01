import test from 'node:test';
import assert from 'node:assert/strict';
import { firstRelatedSearchTerm, parseSearchQuery, searchQueryUsesFamily, searchQueryVariants } from '../lib/search-language.mjs';
import { matchesInstoreSearch } from '../lib/instore-discovery.mjs';

test('short adjacent-letter swaps expand only within known multi-word families', () => {
  for (const query of ['sotf toys', 'sotf toy', 'soft tosy', 'SOTF TOYS']) {
    assert.equal(searchQueryUsesFamily(query, 'soft toy'), true, query);
    assert.ok(searchQueryVariants(query).includes('soft toy'), query);
    assert.equal(firstRelatedSearchTerm(query), 'soft toy', query);
  }
});

test('typo expansion retains product qualifiers and existing exclusions', () => {
  const dolphin = { sku: '8626110114', title: 'SOFT TOY DOLPHIN', category: 'SOFT TOYS' };
  const bear = { sku: 'BEAR001', title: 'SOFT TOY BEAR', category: 'SOFT TOYS' };
  const pen = { sku: 'PEN001', title: 'PEN PLUSH LION', category: 'STATIONERY/ART' };
  const socks = { sku: 'SOCK001', title: 'COTTON SOCKS', category: 'SOFT TOYS' };
  assert.equal(matchesInstoreSearch(dolphin, 'sotf toys dolphin'), true);
  assert.equal(matchesInstoreSearch(bear, 'sotf toys dolphin'), false);
  assert.equal(matchesInstoreSearch(pen, 'sotf toys'), false);
  assert.equal(matchesInstoreSearch(socks, 'sotf toys'), false);
  assert.deepEqual(parseSearchQuery('sotf toys under R100').priceMax, 100);
});

test('short substitutions and unrelated words do not become a product family', () => {
  for (const query of ['soff toys', 'salt toys', 'sotf', 'blush']) {
    assert.equal(searchQueryUsesFamily(query, 'soft toy'), false, query);
  }
  assert.equal(matchesInstoreSearch({ title: 'BARBER BRUSH', category: 'COSMETICS SKIN CARE' }, 'blush'), false);
});

test('numeric and alphanumeric identifiers never receive typo expansion', () => {
  for (const query of ['8626110114', '8626110141', 'SOTF123', 'SOFT123']) {
    assert.deepEqual(searchQueryVariants(query), [query.toLowerCase()]);
  }
  const dolphin = { sku: '8626110114', title: 'SOFT TOY DOLPHIN', category: 'SOFT TOYS' };
  assert.equal(matchesInstoreSearch(dolphin, '8626110114'), true);
  assert.equal(matchesInstoreSearch(dolphin, '8626110141'), false);
});
