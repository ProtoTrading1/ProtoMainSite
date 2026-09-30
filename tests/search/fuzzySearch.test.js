import test from 'node:test';
import assert from 'node:assert/strict';

import { getSuggestions, prepareSearchIndex } from '../../src/lib/fuzzySearch.js';
import { isIdentifierQuery } from '../../src/lib/identifierNormalize.js';

const products = [
  { id: 'wallet', code: '60010001', barcode: '60010001', sku: 'WA100', websiteSku: 'WA100', name: 'Ladies Wallet', stockOnHand: 20 },
  { id: 'bear', code: 'ST200', name: 'Soft Toy Bear', stockOnHand: 12 },
  { id: 'stationery', code: 'PN300', name: 'Stationery Pen Set', stockOnHand: 8 },
  { id: 'oos-bag', code: 'BG400', name: 'Gift Bag', stockOnHand: 0 },
  { id: 'live-bag', code: 'BG401', name: 'Gift Bag', stockOnHand: 10 },
  { id: 'mkt-item', code: '70010002', barcode: '70010002', sku: 'MKT250', websiteSku: 'MKT250', name: 'Display Hooks', stockOnHand: 15 },
  { id: 'hair-clip', code: 'HC500', name: 'Hair Clip Assorted', stockOnHand: 18 },
  { id: 'phone-case', code: 'PC600', name: 'Mobile Phone Case', stockOnHand: 22 },
  { id: 'blush', code: 'BU700', name: 'Beauty Blush Palette', stockOnHand: 16 },
  { id: 'teddy-clay', code: 'TC701', name: 'Teddy Modeling Clay', stockOnHand: 16 },
  { id: 'teddy-crayons', code: 'TC702', name: 'Crayons Wax Jumbo Teddy', stockOnHand: 16 },
  { id: 'plush-pen', code: 'PP703', name: 'Pen Plush Lion', stockOnHand: 16 },
  { id: 'plush-fabric', code: 'PF704', name: 'Wool Plush Velvet', stockOnHand: 16 },
  { id: 'paint-brush', code: 'PB705', name: 'Paint Brush Set 3PC', stockOnHand: 16 },
  { id: 'hair-brush', code: 'HB706', name: 'Hair Brush Assorted', stockOnHand: 16 },
  { id: 'colour-pencils', code: 'CP707', name: 'Color Pencils 12X2 Colours', stockOnHand: 16 },
  { id: 'backpack', code: 'BP708', name: 'DIY Backpack With Markers', stockOnHand: 16 },
  { id: 'bead-glue', code: 'BG709', name: 'Bead Glue B6000 50ml', stockOnHand: 16 },
  { id: 'nail-glue', code: 'NG710', name: 'Nail Glue', stockOnHand: 16 },
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
  assert.equal(getSuggestions(products, 'sku WA100', 5)[0]?.id, 'wallet');
  assert.equal(getSuggestions(products, 'WA-100', 5)[0]?.id, 'wallet');
  assert.equal(getSuggestions(products, '60010001', 5)[0]?.id, 'wallet');
  assert.equal(getSuggestions(products, '6001 0001', 5)[0]?.id, 'wallet');
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

test('keeps numeric shopping language out of exact identifier lookup', () => {
  for (const query of ['50cm', '0.5m', '500ml', '12 pack', 'pack of 12', 'A4 notebook', 'over R100']) {
    assert.equal(isIdentifierQuery(query), false, query);
  }
  for (const query of ['WA100', '60010001', '6001 0001', 'sku WA100', 'code: 8613100205', '86/131/00205']) {
    assert.equal(isIdentifierQuery(query), true, query);
  }
});

test('uses the shared customer-language families across the main catalogue', () => {
  const nonToyIds = new Set(['blush', 'teddy-clay', 'teddy-crayons', 'plush-pen', 'plush-fabric']);
  for (const query of [
    'plush', 'plushie', 'plushies', 'stuffed animal', 'cuddly toy',
    'teddy bear', 'teddy bears', 'soft doll', 'softtoys', 'soft toyz',
    'soft animal', 'stufed animls', 'pluch', 'tedi',
  ]) {
    const results = getSuggestions(products, query, 5);
    assert.equal(results[0]?.id, 'bear', query);
    assert.equal(results.some((product) => nonToyIds.has(product.id)), false, `${query} excludes non-toy matches`);
  }
  assert.equal(getSuggestions(products, 'teddy', 5).some((product) => nonToyIds.has(product.id)), false);
  assert.equal(getSuggestions(products, 'barrette', 5)[0]?.id, 'hair-clip');
  assert.equal(getSuggestions(products, 'cellphone case', 5)[0]?.id, 'phone-case');
  assert.equal(getSuggestions(products, 'paintbrushes', 5)[0]?.id, 'paint-brush');
  assert.equal(getSuggestions(products, 'hair brushes', 5)[0]?.id, 'hair-brush');
  assert.equal(getSuggestions(products, 'colored pencils', 5)[0]?.id, 'colour-pencils');
  assert.equal(getSuggestions(products, 'back pack', 5)[0]?.id, 'backpack');
  assert.equal(getSuggestions(products, 'school bag', 5)[0]?.id, 'backpack');
  for (const query of ['bulk school bags', 'school bags wholesale', 'MOQ 12 school bags', 'box of 24 school bags', 'dozen school bags']) {
    assert.equal(getSuggestions(products, query, 5)[0]?.id, 'backpack', query);
  }
  assert.equal(getSuggestions(products, 'craft glue', 5)[0]?.id, 'bead-glue');
  assert.equal(getSuggestions(products, 'craft glue', 5).some((product) => product.id === 'nail-glue'), false);
  assert.deepEqual(getSuggestions([
    { id: 'penguin', code: 'ST711', name: 'Soft Toy Penguin', categoryPath: ['Soft toys'], stockOnHand: 12 },
  ], 'plush pen', 5), []);
});

test('understands deterministic shopping constraints without weakening exact identifiers', () => {
  const phaseOneProducts = [
    { id: 'blue-dolphin-50', code: '8626110059', barcode: '6008626110059', name: 'Soft Toy Blue Dolphin 50cm', price: 89.99, stockOnHand: 14, colour: 'Blue', size: '50cm', categoryPath: ['Soft toys'] },
    { id: 'blue-teddy-live', code: 'BT800', name: 'Soft Toy Blue Teddy', price: 79.99, stockOnHand: 11, colour: 'Blue', categoryPath: ['Soft toys'] },
    { id: 'red-teddy-live', code: 'RT800', name: 'Soft Toy Red Teddy', price: 84.99, stockOnHand: 13, colour: 'Red', categoryPath: ['Soft toys'] },
    { id: 'blue-teddy-out', code: 'BT801', name: 'Soft Toy Blue Teddy', price: 69.99, stockOnHand: 0, colour: 'Blue', categoryPath: ['Soft toys'] },
    { id: 'cheap-soft-toy', code: 'ST900', name: 'Soft Toy Rabbit', price: 99.99, stockOnHand: 12, categoryPath: ['Soft toys'] },
    { id: 'expensive-soft-toy', code: 'ST901', name: 'Soft Toy Rabbit Deluxe', price: 149.99, stockOnHand: 12, categoryPath: ['Soft toys'] },
    { id: 'long-dolphin', code: 'ST902', name: 'Soft Toy Blue Dolphin 150cm', price: 79.99, stockOnHand: 12, colour: 'Blue', size: '150cm', categoryPath: ['Soft toys'] },
    { id: 'vat-over-cap', code: 'ST903', name: 'Soft Toy Fox', price: 90, priceInclVat: 103.5, stockOnHand: 12, categoryPath: ['Soft toys'] },
  ];
  prepareSearchIndex(phaseOneProducts);
  assert.equal(getSuggestions(phaseOneProducts, 'blue dolphin 50cm', 5)[0]?.id, 'blue-dolphin-50');
  assert.equal(getSuggestions(phaseOneProducts, 'soft toy 50 cm', 5)[0]?.id, 'blue-dolphin-50');
  assert.equal(getSuggestions(phaseOneProducts, 'soft toy 500mm', 5)[0]?.id, 'blue-dolphin-50');
  assert.equal(getSuggestions(phaseOneProducts, 'soft toy 0.5m', 5)[0]?.id, 'blue-dolphin-50');
  assert.equal(getSuggestions(phaseOneProducts, 'soft toy 50 cm', 10).some((product) => product.id === 'long-dolphin'), false);
  assert.deepEqual(
    new Set(getSuggestions(phaseOneProducts, 'cheap soft toys under R100', 10).map((product) => product.id)),
    new Set(['blue-teddy-live', 'red-teddy-live', 'blue-teddy-out', 'cheap-soft-toy', 'blue-dolphin-50', 'long-dolphin']),
  );
  assert.deepEqual(
    getSuggestions(phaseOneProducts, 'in stock blue teddy', 10).map((product) => product.id),
    ['blue-teddy-live'],
  );
  assert.deepEqual(
    getSuggestions(phaseOneProducts, 'available blue teddy', 10).map((product) => product.id),
    ['blue-teddy-live'],
  );
  for (const query of ['soft toys under 100 rand', 'soft toys R100 and below', 'soft toys below R100 incl VAT']) {
    const ids = getSuggestions(phaseOneProducts, query, 20).map((product) => product.id);
    assert.equal(ids.includes('expensive-soft-toy'), false, query);
    assert.equal(ids.includes('vat-over-cap'), false, query);
    assert.equal(ids.includes('cheap-soft-toy'), true, query);
  }
  assert.deepEqual(
    new Set(getSuggestions(phaseOneProducts, 'red or blue soft toys', 20).map((product) => product.id)),
    new Set(['blue-dolphin-50', 'blue-teddy-live', 'red-teddy-live', 'blue-teddy-out', 'long-dolphin']),
  );
  assert.equal(getSuggestions(phaseOneProducts, '8626110059', 5)[0]?.id, 'blue-dolphin-50');
  assert.equal(getSuggestions(phaseOneProducts, 'soft toys under R100', 10).some((product) => product.id === 'vat-over-cap'), false);
});
