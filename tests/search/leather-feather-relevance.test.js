import test from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyFilter, prepareSearchIndex } from '../../src/lib/fuzzySearch.js';
import { matchesInstoreSearch } from '../../lib/instore-discovery.mjs';

const products = [
  { sku: 'LEATHER', name: 'Leather Bag', title: 'Leather Bag', category: 'BAGS & WALLETS' },
  ...['8616500402', '8616500403'].map(sku => ({ sku, name: 'GIFT BAG FEATHER PRINT W/GLIT', title: 'GIFT BAG FEATHER PRINT W/GLIT', category: 'BAGS & WALLETS' })),
];

for (const [scope, search] of [
  ['Main', (rows, query) => fuzzyFilter(rows, query)],
  ['Instore', (rows, query) => rows.filter(row => matchesInstoreSearch(row, query))],
]) {
  test(`${scope} does not substitute feather for leather, including plural/reordered queries`, () => {
    prepareSearchIndex(products);
    for (const query of ['Leather bag', 'Leather bags', 'bags leather', 'leather']) {
      assert.deepEqual(search(products, query).map(row => row.sku), ['LEATHER'], query);
      assert.deepEqual(search(products.slice(1), query), [], `no leather products: ${query}`);
    }
    assert.deepEqual(search(products, 'feather bags').map(row => row.sku), ['8616500402', '8616500403']);
    assert.deepEqual(search(products, 'GIFT BAG FEATHER PRINT W/GLIT').map(row => row.sku), ['8616500402', '8616500403']);
  });

  test(`${scope} retains internal substitutions, omissions, insertions and adjacent swaps`, () => {
    const leather = [products[0]];
    for (const query of ['leatger bag', 'leater bag', 'leatherr bag', 'leathre bag', 'elather bag']) {
      assert.deepEqual(search(leather, query).map(row => row.sku), ['LEATHER'], query);
    }
    const chargers = [{ sku: 'CHARGER', name: 'Fast Charger', title: 'Fast Charger' }];
    assert.deepEqual(search(chargers, 'chsrger').map(row => row.sku), ['CHARGER']);
  });
}
