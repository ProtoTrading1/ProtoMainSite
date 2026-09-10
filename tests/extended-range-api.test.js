import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExtendedRangeProducts, readCompleteRows } from '../api/extended-range.js';

const valid = {
  sku: '8618100133', image_source: 'nutstore', barcode: '', title: 'BRACELET WOODEN BEADS',
  original_description: 'BRACELET WOODEN BEADS', price: 13.5, available_stock: 3,
  category: 'Jewellery', image_url: 'https://images.example.test/8618100133.jpg',
  image_review_status: 'verified', visibility_status: 'search_only', is_active: true,
};

test('Instore feed includes only reviewed priced positive-stock records', () => {
  const products = buildExtendedRangeProducts([
    valid,
    { ...valid, sku: '8618100134', available_stock: 0 },
    { ...valid, sku: '8618100135', available_stock: -1 },
    { ...valid, sku: '8618100136', image_review_status: 'pending' },
    { ...valid, sku: '8618100137', visibility_status: 'hidden' },
  ]);
  assert.deepEqual(products.map((product) => product.sku), ['8618100133']);
  assert.equal(products[0].availability.canOrder, true);
  assert.equal(products[0].stockQty, 3);
});

test('plain language discovery search does not loosen eligibility', () => {
  assert.equal(buildExtendedRangeProducts([valid], 'wood bracelet').length, 1);
  assert.equal(buildExtendedRangeProducts([{ ...valid, available_stock: 0 }], 'bracelet').length, 0);
});

test('legacy verified Instore records do not require a source-label backfill', () => {
  const legacy = { ...valid };
  delete legacy.image_source;
  assert.equal(buildExtendedRangeProducts([legacy], 'bracelet').length, 1);
});

test('staged hidden products are preview-only and still need positive stock', () => {
  const staged = { ...valid, visibility_status: 'hidden', is_active: false };
  assert.equal(buildExtendedRangeProducts([staged]).length, 0);
  assert.equal(buildExtendedRangeProducts([staged], '', { includeStaged: true }).length, 1);
  assert.equal(buildExtendedRangeProducts([{ ...staged, available_stock: 0 }], '', { includeStaged: true }).length, 0);
});

test('preview catalogue read tolerates an import count increasing between pages', async () => {
  let request = 0;
  const rows = await readCompleteRows(() => ({
    order: () => ({ range: () => {
      request += 1;
      return Promise.resolve(request === 1
        ? { data: Array.from({ length: 1000 }, (_, index) => ({ sku: String(index) })), count: 1001, error: null }
        : { data: [{ sku: '1000' }, { sku: '1001' }], count: 1002, error: null });
    } }),
  }), { allowChangingCount: true });
  assert.equal(rows.length, 1002);
});

test('production catalogue read remains strict when its count changes', async () => {
  let request = 0;
  await assert.rejects(() => readCompleteRows(() => ({
    order: () => ({ range: () => {
      request += 1;
      return Promise.resolve(request === 1
        ? { data: Array.from({ length: 1000 }, (_, index) => ({ sku: String(index) })), count: 1001, error: null }
        : { data: [{ sku: '1000' }, { sku: '1001' }], count: 1002, error: null });
    } }),
  })), /Catalogue lookup incomplete/);
});
