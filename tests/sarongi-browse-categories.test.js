import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../api/_website-only-manifest.json' with { type: 'json' };
import categories from '../lib/sarongi-browse-categories.json' with { type: 'json' };
import { buildExtendedRangeProducts } from '../api/extended-range.js';
import { discoveryGroup, discoveryTiles } from '../lib/instore-discovery.mjs';
import { instorePage } from '../lib/instore-page.mjs';

test('the reviewed 163 exact products are browsable in their assigned categories', () => {
  const rows = manifest.items.map(item => ({sku:item.sku,barcode:item.sku,title:item.description,
    original_description:item.description,price:1,available_stock:1,category:item.category,
    image_url:'https://www.proto.co.za'+item.mainPath,image_source:'nutstore',
    image_review_status:'verified',visibility_status:'search_only',is_active:true}));
  const products = buildExtendedRangeProducts(rows);
  assert.equal(products.length, 163);
  assert.equal(Object.keys(categories).length, 163);
  for (const product of products) {
    assert.equal(discoveryGroup(product), categories[product.sku].category, product.sku);
    const found = instorePage(products, { category: categories[product.sku].category, query: product.sku, page: 1, pageSize: 24 });
    assert.deepEqual(found.products.map(p => p.sku), [product.sku], product.sku);
  }
  const tiles = discoveryTiles(products);
  assert.equal(tiles.reduce((sum, tile) => sum + tile.count, 0), 163);
  assert.equal(tiles.find(tile => tile.label === 'Musical instruments').count, 20);
  assert.equal(tiles.find(tile => tile.label === 'Keyrings').count, 7);
  assert.equal(tiles.find(tile => tile.label === 'More finds'), undefined);
});

test('the override cannot classify another product or a changed description', () => {
  assert.equal(discoveryGroup({ sku: 'N-DRU2002', title: 'BRACELET GOLD' }), 'Bracelets');
  assert.equal(discoveryGroup({ sku: 'N-DRU2003', title: 'DRUM 20CM DJEMBE DEEP CARVING' }), 'More finds');
  assert.equal(discoveryGroup({ sku: '86181001', title: 'BRACELET GOLD' }), 'Bracelets');
});
