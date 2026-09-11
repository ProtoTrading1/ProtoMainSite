import test from 'node:test';
import assert from 'node:assert/strict';
import { compareInstoreSearch, discoveryGroup, discoveryTiles, matchesInstoreSearch } from '../lib/instore-discovery.mjs';

test('uses Positill department and description for the soft-toy browse tile', () => {
  const product = {
    sku: '8626100117',
    title: 'SOFT TOY +-50CM GIRAFFE',
    originalDescription: 'SOFT TOY +-50CM GIRAFFE',
    category: 'SOFT TOYS',
  };

  assert.equal(discoveryGroup(product), 'Soft toys');
  assert.equal(matchesInstoreSearch(product, 'soft toys'), true);
  assert.equal(matchesInstoreSearch(product, 'giraffe'), true);
});

test('uses Positill department wording to keep party items distinct from toys', () => {
  assert.equal(discoveryGroup({ title: 'PARTY TOY CLUB', category: 'PARTY / FANCY DRES' }), 'Party items');
  assert.equal(discoveryGroup({ title: 'TOY PUZZLE ANIMAL', category: 'TOYS + GAMES' }), 'Toys & games');
});

test('ranks direct description matches ahead of related browse matches', () => {
  const direct = { title: 'BRACELET WOODEN BEADS', category: 'FASHION JEWELLERY' };
  const related = { title: 'MEMORY WIRE BANGLE', category: 'PENDNTS BRACLTS RNGS' };
  assert.ok(compareInstoreSearch(direct, related, 'bracelet') < 0);
});

test('starts browse discovery with beads and jewellery making', () => {
  const tiles = discoveryTiles([
    { title: 'SOFT TOY BEAR', category: 'SOFT TOYS' },
    { title: 'WOODEN BEADS', category: 'WOODEN BEADS' },
    { title: 'BRACELET', category: 'FASHION JEWELLERY' },
  ]);
  assert.equal(tiles[0].label, 'Beads & jewellery making');
});

test('uses a recognisable in-stock product as the browse thumbnail', () => {
  const tiles = discoveryTiles([
    { sku: '8600000001', title: 'MAGNETIC CLASP', category: 'BEAD METAL PARTS', image: 'clasp.jpg' },
    { sku: '8618100133', title: 'BRACELET WOODEN BEADS', category: 'WOODEN BEADS', image: 'bracelet.jpg' },
  ]);
  const beads = tiles.find((tile) => tile.label === 'Beads & jewellery making');
  assert.equal(beads?.sku, '8618100133');
  assert.equal(beads?.image, 'bracelet.jpg');
});

test('keeps fancy-dress products out of the party browse thumbnail', () => {
  const tiles = discoveryTiles([
    { sku: '8601897013', title: 'WITCHES NOSE CARDED', category: 'PARTY / FANCY DRES', image: 'witch.jpg' },
    { sku: '8602000001', title: 'PARTY BALLOONS ASSORTED', category: 'PARTY / FANCY DRES', image: 'balloons.jpg' },
  ]);
  const party = tiles.find((tile) => tile.label === 'Party items');
  assert.equal(party?.sku, '8602000001');
  assert.equal(party?.image, 'balloons.jpg');
});
