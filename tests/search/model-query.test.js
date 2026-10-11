import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyFilter } from '../../src/lib/fuzzySearch.js';
import { compareInstoreSearch, matchesInstoreSearch } from '../../lib/instore-discovery.mjs';
import { readCatalogueSearchCandidates } from '../../api/_instore-catalogue.js';

const rows = [
  { sku: '1002110432', name: 'Hoco C102a Fast Charger' },
  { sku: '1002110433', title: 'Hoco C102a1 Fast Charger', name: 'Hoco C102a1 Fast Charger' },
  { sku: '1002110434', name: 'Other Charger', description: 'C102a', category: 'C102a' },
  { sku: 'C102a', name: 'Exact operational code' },
  { sku: '1002110435', barcode: 'C102a', name: 'Exact barcode' },
];

test('bare model tokens match whole titles below exact operational identifiers', () => {
  for (const query of ['C102a', 'c102A']) {
    assert.deepEqual(fuzzyFilter(rows, query).map((row) => row.sku), ['C102a', '1002110435', '1002110432']);
    assert.deepEqual(rows.filter((row) => matchesInstoreSearch(row, query))
      .sort((left, right) => compareInstoreSearch(left, right, query)).map((row) => row.sku),
    ['C102a', '1002110435', '1002110432']);
  }
  const titleOnly = { sku: '900001', title: 'Hoco C102a Charger' };
  assert.deepEqual(fuzzyFilter([titleOnly], 'C102a'), [titleOnly]);
  assert.equal(matchesInstoreSearch(titleOnly, 'C102a'), true);
});

test('explicit identifier labels, numeric codes and punctuated models do not use title fallback', () => {
  for (const query of ['sku: C102a', 'barcode: C102a', 'C-102a', 'C102', '102a', '100211043']) {
    assert.equal(fuzzyFilter([rows[0]], query).length, 0, query);
    assert.equal(matchesInstoreSearch(rows[0], query), false, query);
  }
  const numericTitle = { sku: '777777', name: 'Charger 123456' };
  assert.equal(fuzzyFilter([numericTitle], '123456').length, 0);
  assert.equal(matchesInstoreSearch(numericTitle, '123456'), false);
  const shortModels = [{ sku: '80001', name: 'Model A1' }, { sku: '80002', name: 'Model A12' }];
  assert.deepEqual(fuzzyFilter(shortModels, 'A1').map((row) => row.sku), ['80001']);
  assert.deepEqual(shortModels.filter((row) => matchesInstoreSearch(row, 'A1')).map((row) => row.sku), ['80001']);
  assert.equal(fuzzyFilter([{ sku: '80003', title: 'Model A1' }], 'A1').length, 1);
});

test('stored eligible snapshot model lookup retains category scope and ignores outdated tokens', async () => {
  const snapshot = rows.map((payload, index) => ({ sku: payload.sku, payload, discovery_group: index ? 'Other' : 'Electronics', search_tokens: ' outdated ' }));
  const client = { from: () => {
    let category = '';
    const request = {
      select: () => request,
      eq: (_column, value) => { category = value; return request; },
      order: () => request,
      range: (from, to) => {
        const eligible = snapshot.filter((row) => !category || row.discovery_group === category);
        return Promise.resolve({ data: eligible.slice(from, to + 1), count: eligible.length, error: null });
      },
    };
    return request;
  } };
  assert.deepEqual((await readCatalogueSearchCandidates(client, { query: 'C102a', category: 'Electronics' })).map((row) => row.sku), ['1002110432']);
  assert.deepEqual((await readCatalogueSearchCandidates(client, { query: 'sku: C102a', category: 'Electronics' })), []);
});
