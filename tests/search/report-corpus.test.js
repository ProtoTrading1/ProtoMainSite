import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyFilter } from '../../src/lib/fuzzySearch.js';
import { matchesInstoreSearch } from '../../lib/instore-discovery.mjs';

import { reportCases } from '../fixtures/search-report-corpus.js';
import { normalizeInstoreSearchQuery } from '../../src/lib/instoreSearchRoute.js';

test('Instore routes preserve every original full-title query', () => {
  for (const [query] of reportCases) assert.equal(normalizeInstoreSearchQuery(query), query);
  assert.equal(normalizeInstoreSearchQuery('x'.repeat(500)).length, 400);
});
test('every original report term replays consistently in Main and Instore matching', () => {
  const names = [...new Set(reportCases.map(([, name]) => name).filter(Boolean)), 'Gingerbread House', 'Sewing Set In Black Case', 'Leather Wallet'];
  const rows = names.map((name, index) => ({ id: `CORPUS-${index}`, sku: `CORPUS-${index}`, name, title: name, price: 100, stockOnHand: 10 }));
  assert.equal(reportCases.length, 27);
  for (const [query, expected] of reportCases) {
    const main = fuzzyFilter(rows, query);
    const instore = rows.filter((row) => matchesInstoreSearch(row, query));
    if (expected) {
      assert.ok(main.some((row) => row.name === expected), `Main: ${query}`);
      assert.ok(instore.some((row) => row.name === expected), `Instore: ${query}`);
    } else {
      assert.deepEqual(main, [], `Main unsupported gap: ${query}`);
      assert.deepEqual(instore, [], `Instore unsupported gap: ${query}`);
    }
  }
});
