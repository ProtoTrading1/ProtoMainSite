import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesInstoreSearch } from '../../lib/instore-discovery.mjs';
import { catalogueSearchPatterns, catalogueSearchTokens } from '../../api/_instore-catalogue.js';

test('three-letter SKU prefixes find jewellery without relaxing exact SKU searches', () => {
  const bracelet = { sku: 'KBRA3006', name: 'BRACELET 2 COWRIE W/BEADS' };
  const other = { sku: 'KNEC3006', name: 'NECKLACE' };
  for (const query of ['KBR', 'kbr', 'KBRA']) assert.equal(matchesInstoreSearch(bracelet, query), true, query);
  assert.equal(matchesInstoreSearch(other, 'KBR'), false);
  assert.equal(matchesInstoreSearch(bracelet, 'KBRA3007'), false);
  assert.equal(matchesInstoreSearch(bracelet, 'KB'), false);
  assert.equal(matchesInstoreSearch({ sku: 'OTHER1', name: 'KBRIDGE' }, 'KBR'), false);
  assert.ok(catalogueSearchTokens(bracelet).includes(' kbra3006 '));
  assert.deepEqual(catalogueSearchPatterns('KBR'), ['% kbr%']);
});
