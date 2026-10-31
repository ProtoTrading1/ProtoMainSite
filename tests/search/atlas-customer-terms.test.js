import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyFilter } from '../../src/lib/fuzzySearch.js';
import { matchesInstoreSearch } from '../../lib/instore-discovery.mjs';
import { catalogueSearchTokens, catalogueSearchPatternSets } from '../../api/_instore-catalogue.js';

test('Atlas customer wording finds matching products in both search paths', () => {
  const cases = [
    ['waterbook', '8621300099', 'MAGIC WATER BOOK'],
    ['stop waches', 'DWSTOP1', 'STOP WATCH'],
    ['moon bag', 'BAG123', 'MOONBAG BLACK'],
    ['air dry clay', 'CLAY123', 'MOTARRO AIR CLAY'],
  ];
  for (const [query, sku, title] of cases) {
    const product = { id: sku, sku, name: title, title, originalDescription: title };
    assert.equal(matchesInstoreSearch(product, query), true, `Instore: ${query}`);
    assert.equal(fuzzyFilter([product], query)[0]?.sku, sku, `Main: ${query}`);
    const tokens = catalogueSearchTokens(product);
    const storedCandidate = catalogueSearchPatternSets(query).some((patterns) => patterns.every(
      (pattern) => new RegExp(`^${pattern.split('%').join('[\\s\\S]*')}$`).test(tokens),
    ));
    assert.equal(storedCandidate, true, `Stored Instore index: ${query}`);
  }
});

test('customer language expansion does not rewrite product identifiers', () => {
  const other = { id: 'other', sku: 'DWSTOP2', name: 'STOP WATCH', title: 'STOP WATCH' };
  assert.equal(matchesInstoreSearch(other, 'DWSTOP1'), false);
  assert.deepEqual(fuzzyFilter([other], 'DWSTOP1'), []);
});
