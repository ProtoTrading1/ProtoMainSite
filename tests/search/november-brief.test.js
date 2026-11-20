import test from 'node:test';
import process from 'node:process';
import assert from 'node:assert/strict';
import { fuzzyFilter } from '../../src/lib/fuzzySearch.js';
import { prepareInstoreSearch } from '../../lib/instore-discovery.mjs';
import { fetchIdentifierRows } from '../../api/products.js';
import { resolveAuthoritativePrices } from '../../api/send-order.js';
import { groupProductsByBarcode } from '../../src/lib/productGroups.js';
import { searchRecoveryTerms, searchTypoMatch } from '../../lib/search-language.mjs';
import { novemberProducts as rows, novemberCases, novemberNegatives, novemberInstoreOnly } from '../fixtures/search-november.mjs';
for (const [scope, match] of [
  ['Main', query => fuzzyFilter(rows, query)],
  ['Instore', query => { const search = prepareInstoreSearch(query); return rows.filter(search.matches).sort(search.compare); }],
]) {
  test(`${scope}: November brief membership and literal-before-expansion ranks on labelled fixtures`, () => {
    for (const [query, expected] of novemberCases) {
      const actual = match(query).map(p => p.sku);
      assert.deepEqual([...actual].sort(), [...expected].sort(), query);
      if (['journal', 'serviette', 'squishies'].includes(query)) assert.equal(actual[0], expected[0], `${query} rank`);
    }
    assert.equal(match('MP130-1')[0].sku, 'MP130-1');
    assert.equal(match('mp1301')[0].sku, 'mp1301');
  });
  test(`${scope}: unsupported terms and neighbouring identifiers stay empty`, () => {
    for (const query of novemberNegatives) assert.deepEqual(match(query), [], query);
  });
}
test('suggestions remain distinct from matches and bounded edits reject code/material changes', () => {
  assert.deepEqual(searchRecoveryTerms('glasses'), ['sunglasses']);
  assert.deepEqual(fuzzyFilter(rows.filter(p => p.sku === 'SUN'), 'glasses'), []);
  for (const [a, b] of [['MI07B', 'MI07C'], ['2027', '2028'], ['leather', 'feather'], ['blush', 'brush'], ['christmas', 'ceramics']]) assert.equal(searchTypoMatch(a, b), false);
  for (const [a, b] of [['chritms', 'christmas'], ['diarry', 'diary'], ['scraf', 'scarf']]) assert.equal(searchTypoMatch(a, b), true);
});

test('shared barcode cards retain every distinct eligible variant exactly once', () => {
  const cards = groupProductsByBarcode(fuzzyFilter(rows, '8621100236'));
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].variants.map(p => p.sku).sort(), ['FIX-IVR', 'FIX-PEA', 'FIX-PNK', 'FIX-TUR']);
});

test('reported current search-only Instore records stay channel-specific positives', () => {
  for (const [query, skus] of [['crochet', ['78437', '78445']], ['table cloth', ['8640000178']], ['8640000272', ['8640000272']]]) {
    const matcher = prepareInstoreSearch(query);
    assert.deepEqual(novemberInstoreOnly.filter(matcher.matches).map(p => p.sku), skus);
    assert.deepEqual(fuzzyFilter(rows, query), []);
  }
});

test('four diary choices share one authoritative stock pool at checkout', async () => {
  const leaves = ['IVR', 'PEA', 'PNK', 'TUR'].map(suffix => ({ sku: `FIX-${suffix}`,
    barcode: '8621100236', title: 'Synthetic diary', price: 100, units_of_issue: 'EACH',
    min_order_qty: 1, available_stock: 20, stock_qty: 20, to_order: false }));
  const originalFetch = globalThis.fetch;
  const envNames = ['VITE_STOCK_SUPABASE_URL', 'VITE_STOCK_SUPABASE_KEY'];
  const originalEnv = envNames.map(key => process.env[key]);
  process.env.VITE_STOCK_SUPABASE_URL = 'https://synthetic-checkout.invalid';
  process.env.VITE_STOCK_SUPABASE_KEY = 'synthetic';
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.hostname, 'synthetic-checkout.invalid');
    const data = url.pathname.endsWith('/website_stock') ? leaves
      : url.pathname.endsWith('/get_website_product_availability') ? [] : null;
    assert.notEqual(data, null);
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await resolveAuthoritativePrices(leaves.map(row => ({ qty: 6, product: {
      sku: row.sku, barcode: row.barcode, code: row.barcode, checkoutSnapshot: { unitPrice: 100, stockQty: 20 },
    } })), { classify: async () => new Set() });
    assert.equal(result.length, 4);
    assert.deepEqual(result[0].product.stockRequest, { availableQty: 20, requestedQty: 24, shortfallQty: 4, sharedStock: true });
  } finally {
    globalThis.fetch = originalFetch;
    envNames.forEach((key, index) => { if (originalEnv[index] === undefined) delete process.env[key]; else process.env[key] = originalEnv[index]; });
  }
});

test('fast identifier database reads retain case/hyphen collisions and rank the requested spelling first', async () => {
  const records = [{ sku: 'MP130-1', barcode: 'CANVAS' }, { sku: 'mp1301', barcode: 'COLLISION' }, { sku: 'MP130-2', barcode: 'OTHER' }, { sku: 'BARCODE-LEAF', barcode: '8616300009b' }];
  const reads = [];
  const client = { from(table) {
    assert.equal(table, 'website_stock');
    let filter;
    const query = { select() { return query; }, range() { return query; }, order() { return query; }, or(value) { filter = value; reads.push(value); return query; },
      then(resolve) { return Promise.resolve({ data: records.filter(row => filter.split(',').some(clause => {
        const [field, , value] = clause.split('.'); return String(row[field]).toUpperCase() === value.toUpperCase();
      })), error: null }).then(resolve); } };
    return query;
  } };
  for (const [raw, first] of [['MP130-1', 'MP130-1'], ['mp1301', 'mp1301']]) {
    const result = await fetchIdentifierRows(client, 'MP1301', raw);
    assert.deepEqual(result.map(row => row.sku).sort(), ['MP130-1', 'mp1301']);
    assert.equal(result[0].sku, first);
  }
  assert.equal(reads.length, 2, 'each uses one exact read without a full scan');
  assert.ok(reads.every(filter => !filter.includes('%')));
  assert.deepEqual((await fetchIdentifierRows(client, '8616300009B')).map(row => row.sku), ['BARCODE-LEAF']);
  assert.ok(reads.at(-1).includes('barcode.ilike.8616300009B'));
});

test('a year SKU retains priority over an exact year title without losing diary results', () => {
  const conflict = [
    { sku: '2027999999', name: 'Unrelated numeric neighbour', title: 'Unrelated numeric neighbour' },
    { sku: 'TITLE', name: '2027', title: '2027' },
    { sku: '2027', name: 'Exact stock code item', title: 'Exact stock code item' },
    { sku: 'YEAR-DIARY', name: 'Diary 2027', title: 'Diary 2027' },
  ];
  assert.deepEqual(fuzzyFilter(conflict, '2027').map(row => row.sku), ['2027', 'TITLE', 'YEAR-DIARY']);
  const search = prepareInstoreSearch('2027');
  assert.deepEqual(conflict.filter(search.matches).sort(search.compare).map(row => row.sku), ['2027', 'TITLE', 'YEAR-DIARY']);
});
