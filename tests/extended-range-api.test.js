import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExtendedRangeProducts, buildPreviewProducts, readCompletePreviewRows, readCompleteRows, signPreviewImages } from '../api/extended-range.js';

const valid = {
  sku: '8618100133', image_source: 'nutstore', barcode: '', title: 'BRACELET WOODEN BEADS',
  original_description: 'BRACELET WOODEN BEADS', price: 13.5, available_stock: 3,
  category: 'Jewellery', image_url: 'https://images.example.test/8618100133.jpg',
  image_review_status: 'verified', visibility_status: 'search_only', is_active: true,
};

test('Instore feed includes only reviewed priced records with at least ten available units', () => {
  const products = buildExtendedRangeProducts([
    { ...valid, available_stock: 10 },
    { ...valid, sku: '8618100134', available_stock: 0 },
    { ...valid, sku: '8618100138', available_stock: 9 },
    { ...valid, sku: '8618100135', available_stock: -1 },
    { ...valid, sku: '8618100136', image_review_status: 'pending' },
    { ...valid, sku: '8618100137', visibility_status: 'hidden' },
  ]);
  assert.deepEqual(products.map((product) => product.sku), ['8618100133']);
  assert.equal(products[0].availability.canOrder, true);
  assert.equal(products[0].stockQty, 10);
});

test('plain language discovery search does not loosen eligibility', () => {
  assert.equal(buildExtendedRangeProducts([{ ...valid, available_stock: 10 }], 'wood bracelet').length, 1);
  assert.equal(buildExtendedRangeProducts([{ ...valid, available_stock: 0 }], 'bracelet').length, 0);
});

test('legacy verified Instore records do not require a source-label backfill', () => {
  const legacy = { ...valid, available_stock: 10 };
  delete legacy.image_source;
  assert.equal(buildExtendedRangeProducts([legacy], 'bracelet').length, 1);
});

test('staged hidden products are preview-only and still need ten available units', () => {
  const staged = { ...valid, available_stock: 10, visibility_status: 'hidden', is_active: false };
  assert.equal(buildExtendedRangeProducts([staged]).length, 0);
  assert.equal(buildExtendedRangeProducts([staged], '', { includeStaged: true }).length, 1);
  assert.equal(buildExtendedRangeProducts([{ ...staged, available_stock: 0 }], '', { includeStaged: true }).length, 0);
});

test('isolated preview mapping uses the VAT-inclusive run price and cannot make stockless rows sellable', () => {
  const previewRow = {
    sku: '8618100133', barcode: '', title: 'BRACELET WOODEN BEADS',
    price_incl_vat: 13.5, available_stock: 10, department: 'Beads',
    image_url: 'https://preview-images.example.test/8618100133.jpg',
  };
  const products = buildPreviewProducts([previewRow], 'wood bracelet');
  assert.equal(products.length, 1);
  assert.equal(products[0].price, 13.5);
  assert.equal(products[0].stockQty, 10);
  assert.equal(buildPreviewProducts([{ ...previewRow, available_stock: 0 }]).length, 0);
  assert.equal(buildPreviewProducts([{ ...previewRow, image_url: null }]).length, 0);
});

test('isolated preview preserves a VAT-inclusive price that is not on the normal price grid', () => {
  const [product] = buildPreviewProducts([{
    sku: '8601056001', title: 'PARTY LACE GLOVES', price_incl_vat: 69.49,
    available_stock: 10, department: 'Party', image_url: 'https://preview-images.example.test/8601056001.jpg',
  }]);
  assert.equal(product.price, 69.49);
});

test('isolated preview signs only objects belonging to its configured run', async () => {
  const signedPaths = [];
  const client = { storage: { from: (bucket) => ({ createSignedUrls: async (paths, ttl) => {
    assert.equal(bucket, 'preview-instore-images');
    assert.equal(ttl, 3600);
    signedPaths.push(...paths);
    return { error: null, data: paths.map((path) => ({ path, signedUrl: `https://signed.example.test/${path}` })) };
  } }) } };
  const rows = await signPreviewImages(client, 'run-a', [
    { sku: 'A', image_object_path: 'runs/run-a/A/a.jpg' },
    { sku: 'B', image_object_path: 'runs/other/B/b.jpg' },
  ]);
  assert.deepEqual(signedPaths, ['runs/run-a/A/a.jpg']);
  assert.match(rows[0].image_url, /^https:\/\/signed\.example\.test\//);
  assert.equal(rows[1].image_url, '');
});

test('isolated preview reads every database page instead of stopping at 1,000 products', async () => {
  const total = 6030;
  const query = {
    select: () => query, eq: () => query, not: () => query,
    order: () => ({ range: (from, to) => Promise.resolve({
      data: Array.from({ length: Math.max(0, Math.min(total - from, to - from + 1)) }, (_, index) => ({ sku: String(from + index) })),
      count: total, error: null,
    }) }),
  };
  const rows = await readCompletePreviewRows({ from: () => query }, 'run-a');
  assert.equal(rows.length, total);
});

test('complete catalogue reads support the full Positill-scale code index', async () => {
  const total = 41174;
  const rows = await readCompleteRows(() => ({
    order: () => ({ range: (from, to) => Promise.resolve({
      data: Array.from({ length: Math.max(0, Math.min(total - from, to - from + 1)) }, (_, index) => ({ sku: String(from + index) })),
      count: total, error: null,
    }) }),
  }));
  assert.equal(rows.length, total);
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
