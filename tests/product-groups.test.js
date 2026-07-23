import test from 'node:test';
import assert from 'node:assert/strict';
import { variantGroupKey, groupProductsByBarcode } from '../src/lib/productGroups.js';

// A storefront-adapted row: id/sku are the SKU, code/barcode are the barcode.
const row = (sku, barcode, over = {}) => ({
  id: sku, sku, code: barcode, barcode, name: over.name || `Item ${sku}`, image: over.image || `${sku}.jpg`, ...over,
});

test('variantGroupKey prefers an admin groupId, else barcode', () => {
  assert.equal(variantGroupKey({ groupId: 'abc', barcode: 'B1' }), 'g:abc');
  assert.equal(variantGroupKey({ barcode: 'B1' }), 'b:B1');
  assert.equal(variantGroupKey({ code: 'B2' }), 'b:B2');
  assert.equal(variantGroupKey({}), null);
});

test('barcode grouping output is byte-identical to the legacy shape (no groupId)', () => {
  // Two SKUs sharing barcode SHARED collapse into one card keyed on the barcode.
  const out = groupProductsByBarcode([
    row('SKU1', 'SHARED', { name: 'Widget Red' }),
    row('SKU2', 'SHARED', { name: 'Widget Blue' }),
    row('SOLO', 'SOLOBC', { name: 'Standalone' }),
  ]);
  const card = out.find((p) => p.isVariantGroup);
  assert.ok(card, 'a variant group card exists');
  assert.equal(card.id, 'group_SHARED');       // unchanged id
  assert.equal(card.code, 'SHARED');
  assert.equal(card.barcode, 'SHARED');
  assert.equal(card.parentSku, 'SHARED');
  assert.equal(card.variantCount, 2);
  // Standalone product passes through untouched.
  assert.ok(out.some((p) => p.id === 'SOLO' && !p.isVariantGroup));
});

test('admin group: distinct barcodes collapse, title from group, identity from primary', () => {
  const g = { groupId: 'GID', groupPrimarySku: 'SKU2', groupTitle: 'Deluxe Widget' };
  const out = groupProductsByBarcode([
    row('SKU1', 'BC1', { ...g, name: 'Widget One' }),
    row('SKU2', 'BC2', { ...g, name: 'Widget Two' }), // the primary member
  ]);
  const card = out.find((p) => p.isVariantGroup);
  assert.ok(card);
  assert.equal(card.id, 'group_g_GID');
  assert.equal(card.title, 'Deluxe Widget');   // from the group, not a prefix heuristic
  assert.equal(card.code, 'BC2');              // primary member's barcode, not "g:GID"
  assert.equal(card.barcode, 'BC2');
  assert.equal(card.variantCount, 2);
  // Every original variant survives inside the card for the selector.
  assert.deepEqual(card.variants.map((v) => v.id).sort(), ['SKU1', 'SKU2']);
});

test('admin group with a single visible member collapses to a normal card', () => {
  const out = groupProductsByBarcode([
    row('SKU1', 'BC1', { groupId: 'GID', groupPrimarySku: 'SKU1', groupTitle: 'Lonely' }),
  ]);
  assert.equal(out.length, 1);
  assert.ok(!out[0].isVariantGroup);
});
