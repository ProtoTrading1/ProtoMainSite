import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchQuery } from '../../lib/search-language.mjs';
import { fuzzyFilter, getSuggestions } from '../../src/lib/fuzzySearch.js';
import { compareInstoreSearch, matchesInstoreSearch } from '../../lib/instore-discovery.mjs';

const title = 'Hoco C102a – 4 USB Ports, Max 28.5w, Qc3.0 Fast Charger';
const charger = { sku: '1002110432', id: '1002110432', name: title, title, price: 100, stockOnHand: 20 };

test('technical ratings in product titles never create a monetary ceiling', () => {
  for (const rating of ['Max 28.5w', 'max 28w', 'MAX 28.5 W', 'maximum 28.5 watts', 'max 28.5V', 'Max 28.5 WATTS']) {
    assert.equal(parseSearchQuery(`Charger ${rating}`).priceMax, null, rating);
  }
  assert.equal(parseSearchQuery(title).priceMax, null);
  assert.match(parseSearchQuery(title).text, /max 28 5w/);
});

test('exact titles, punctuation changes, reordered words and partial terms find the Hoco SKU', () => {
  for (const query of [title, title.replace('–', '-'), title.replace(/[,–]/g, ' '), 'Hoco C102a', 'C102a Hoco', 'hoco fast charger', '1002110432']) {
    assert.equal(fuzzyFilter([charger], query)[0]?.sku, charger.sku, query);
    assert.equal(matchesInstoreSearch(charger, query), true, query);
  }
  assert.deepEqual(fuzzyFilter([charger], 'Hoco garden lights'), []);
});

test('decimal and integer budgets retain their amount and exclude unknown or over-budget prices', () => {
  const rows = [
    { id: 'within', name: 'Charger', price: 28.5 },
    { id: 'above', name: 'Charger', price: 28.51 },
    { id: 'unknown', name: 'Charger' },
  ];
  for (const query of ['charger under R28.50', 'charger BELOW ZAR28,50', 'charger max 28.5', 'charger R28.50 and below']) {
    assert.equal(parseSearchQuery(query).priceMax, 28.5, query);
    assert.equal(parseSearchQuery(query).text, 'charger', query);
    assert.deepEqual(fuzzyFilter(rows, query).map((row) => row.id), ['within'], query);
  }
  assert.equal(parseSearchQuery('charger under 28 rand').priceMax, 28);
  assert.deepEqual(fuzzyFilter(rows, 'charger under R28'), []);
});

test('suggestion caching preserves punctuation that changes shopping intent', () => {
  const rows = [{ id: 'ordinary', name: 'Charger', price: 28.5 }, { id: 'numbered', name: 'Charger 50', price: 20 }];
  for (const queries of [['charger under R28.50', 'charger under R28 50'], ['charger under R28 50', 'charger under R28.50']]) {
    const dataset = rows.map((row) => ({ ...row }));
    for (const query of queries) {
      assert.deepEqual(getSuggestions(dataset, query), fuzzyFilter(dataset, query), query);
    }
  }
});

test('plural and reordered terms keep stable matching counts across both catalogues', () => {
  const rows = [
    { sku: 'LB1', name: 'Leather Bag', title: 'Leather Bag' },
    { sku: 'LB2', name: 'Leather Bags', title: 'Leather Bags' },
    { sku: 'LX1', name: 'Leather Wallet', title: 'Leather Wallet' },
    { sku: 'PX1', name: 'Paper Bag', title: 'Paper Bag' },
  ];
  for (const query of ['leather bag', 'leather bags', 'bags leather', 'bag leather']) {
    assert.deepEqual(new Set(fuzzyFilter(rows, query).map((row) => row.sku)), new Set(['LB1', 'LB2']), query);
    assert.deepEqual(rows.filter((row) => matchesInstoreSearch(row, query)).map((row) => row.sku), ['LB1', 'LB2'], query);
  }
});

test('exact titles lead longer titles; prefixes, descriptions, brands and categories retain all query words', () => {
  const rows = [
    { sku: 'EXT1', name: 'USB Fast Charger Charger', title: 'USB Fast Charger Charger' },
    { sku: 'EXA1', name: 'USB Fast Charger', title: 'USB Fast Charger' },
    { sku: 'SOL1', name: 'Garden Light', title: 'Garden Light', description: 'Solar powered outdoor lamp', brand: 'Hoco', category: 'Lighting', categoryPath: ['Lighting'] },
  ];
  assert.equal(fuzzyFilter(rows, 'USB Fast Charger')[0].sku, 'EXA1');
  assert.equal([...rows].sort((a, b) => compareInstoreSearch(a, b, 'USB Fast Charger'))[0].sku, 'EXA1');
  assert.equal(fuzzyFilter(rows, 'fast charg').length, 2);
  for (const query of ['solar lamps', 'hoco solar', 'lighting solar']) {
    assert.deepEqual(fuzzyFilter(rows, query).map((row) => row.sku), ['SOL1'], query);
    assert.equal(matchesInstoreSearch(rows[2], query), true, query);
  }
  assert.deepEqual(fuzzyFilter(rows, 'hoco charger'), []);
  const bag = { sku: 'LB1', name: 'Leather Bag', title: 'Leather Bag', brand: 'Hoco' };
  assert.equal(matchesInstoreSearch(bag, 'hoco bags'), true);
  const wood = [{ sku: 'W1', name: 'Wood Ring' }, { sku: 'W2', name: 'Wooden Ring' }];
  assert.deepEqual(fuzzyFilter(wood, 'wood ring').map((row) => row.sku), ['W1', 'W2']);
  assert.deepEqual(fuzzyFilter(wood.slice(1), 'wood ring').map((row) => row.sku), ['W2']);
});

test('typos stay conservative and category names cannot impersonate concrete objects', () => {
  const rows = [
    { sku: 'BR1', name: 'Brush', title: 'Brush' },
    { sku: 'SC1', name: 'Scarf', title: 'Scarf' },
    { sku: 'WA1', name: 'Leather Wallet', title: 'Leather Wallet', category: 'Bags & wallets', categoryPath: ['Bags & wallets'] },
    { sku: 'BP1', name: 'Backpack', title: 'Backpack', category: 'Bags & wallets', categoryPath: ['Bags & wallets'] },
  ];
  assert.deepEqual(fuzzyFilter(rows, 'blush'), []);
  assert.equal(fuzzyFilter(rows, 'scraf')[0]?.sku, 'SC1');
  for (const query of ['wallet', 'wallets', 'purse', 'purses']) {
    assert.deepEqual(fuzzyFilter(rows, query).map((row) => row.sku), ['WA1'], query);
    assert.equal(matchesInstoreSearch(rows[3], query), false, query);
  }
});

test('exact identifiers exclude appended-digit neighbours while preserving alphabetic variants', () => {
  const rows = [
    { sku: '812345', barcode: '600123456', name: 'Bag' },
    { sku: '8123459', barcode: '6001234569', name: 'Bag' },
    { sku: '812345A', name: 'Bag' },
  ];
  for (const query of ['812345', 'sku: 812345', '81 2345']) {
    assert.deepEqual(fuzzyFilter(rows, query).map((row) => row.sku), ['812345', '812345A'], query);
    assert.deepEqual(rows.filter((row) => matchesInstoreSearch(row, query)).map((row) => row.sku), ['812345', '812345A'], query);
  }
  assert.deepEqual(rows.filter((row) => matchesInstoreSearch(row, 'barcode: 600123456')).map((row) => row.sku), ['812345']);
  assert.equal([rows[2], rows[0]].sort((a, b) => compareInstoreSearch(a, b, '812345'))[0].sku, '812345');
});

test('unsupported materials, object qualifiers and bead sizes do not broaden to unrelated products', () => {
  const rows = [
    { name: 'Craft Basket 5 In 1', title: 'Craft Basket 5 In 1' },
    { name: 'Gingerbread House', title: 'Gingerbread House' },
    { name: 'Sewing Set In Black Case', title: 'Sewing Set In Black Case' },
    { name: 'Bead 4mm', title: 'Bead 4mm' },
  ];
  for (const query of ['wicker', 'gingerbread man', 'sewing machine bags', 'beads 3mm']) {
    assert.deepEqual(fuzzyFilter(rows, query), [], query);
    assert.equal(rows.some((row) => matchesInstoreSearch(row, query)), false, query);
  }
  assert.equal(fuzzyFilter(rows, 'beads 0.4cm')[0]?.name, 'Bead 4mm');
});
