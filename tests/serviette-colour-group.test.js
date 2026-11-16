import test from 'node:test';
import assert from 'node:assert/strict';
import { withServietteColourGroup, servietteBaseGroupId } from '../api/_serviette-colour-group.js';
import { groupProductsByBarcode } from '../src/lib/productGroups.js';
import { expandIdentifierAdminGroupRows } from '../api/products.js';

test('groups only the twelve solid colour SKUs, preserving other groups', () => {
  const other = { groupId: 'other' };
  const groups = withServietteColourGroup(new Map([['OTHER', other]]));
  assert.equal(groups.size, 13);
  assert.equal(groups.get('OTHER'), other);
  assert.equal(groups.get('8636276005-BLK').groupPrimarySku, '8636276005-BLK');
  for (const suffix of ['GRY', 'LPNK', 'RED', 'YEL']) {
    assert.equal(groups.get(`8636276005-${suffix}`).groupId, 'solid-serviettes-8636276005');
  }
  assert.equal(groups.has('8636276005'), false);
  assert.equal(groups.has('8636276005-10-10'), false);
  assert.equal(servietteBaseGroupId('8636276005', groups), 'solid-serviettes-8636276005');
  assert.equal(servietteBaseGroupId('8636276005-10-10', groups), null);
});

test('does not overwrite an existing Admin group', () => {
  const existing = new Map([['8636276005-BLU', { groupId: 'admin-group' }]]);
  assert.equal(withServietteColourGroup(existing), existing);
});

test('live grouping keeps solid colours separate from printed styles and uses black', () => {
  const groupInfo = withServietteColourGroup(null);
  const barcode = '8636276005';
  const skus = ['8636276005-10-10', '8636276005-BLU', '8636276005-BLK', '8636276005-RED'];
  const rows = skus.map((sku) => ({ id: sku, sku, code: barcode, barcode, image: `${sku}.jpg`, name: sku, ...groupInfo.get(sku) }));
  const cards = groupProductsByBarcode(rows);
  const colourCard = cards.find((card) => card.isVariantGroup);
  assert.equal(cards.length, 2);
  assert.equal(colourCard.image, '8636276005-BLK.jpg');
  assert.deepEqual(colourCard.variants.map((v) => v.sku).sort(), skus.slice(1).sort());
  assert.equal(cards.find((card) => !card.isVariantGroup).sku, '8636276005-10-10');
});

test('base-code lookup expands colours when first results are printed designs', async () => {
  const groupInfo = withServietteColourGroup(null);
  const bySku = [
    { sku: '8636276005-BLK', barcode: '8636276005' },
    { sku: '8636276005-RED', barcode: '8636276005' },
  ];
  const client = { from(table) {
    assert.equal(table, 'website_stock');
    return { select() { return { range() { return { in(_column, skus) {
      return Promise.resolve({ data: bySku.filter((row) => skus.includes(row.sku)), error: null });
    } }; } }; } };
  } };
  const printed = { sku: '8636276005-10-10', barcode: '8636276005' };
  const rows = await expandIdentifierAdminGroupRows(client, [printed], groupInfo, '8636276005');
  assert.deepEqual(rows.map((row) => row.sku), ['8636276005-BLK', '8636276005-RED', '8636276005-10-10']);
});
