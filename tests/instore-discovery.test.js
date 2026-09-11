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

test('does not classify socks as soft toys', () => {
  assert.notEqual(discoveryGroup({ title: 'COTTON SOCKS ASSORTED', category: 'SOCKS' }), 'Soft toys');
  assert.notEqual(discoveryGroup({ title: 'ANKLE SOCKS', category: 'SOFT TOYS' }), 'Soft toys');
  assert.equal(discoveryGroup({ title: 'SOFT TOY TEDDY BEAR', category: 'SOFT TOYS' }), 'Soft toys');
});

test('keeps jewellery-making components out of finished jewellery', () => {
  assert.equal(discoveryGroup({ title: 'JUMP RING 0.7*5MM PKT,50', category: 'FASHION JEWELLERY' }), 'Beads & jewellery making');
  assert.equal(discoveryGroup({ title: 'METAL BEAD RAINBOW', category: 'FASHION JEWELLERY' }), 'Beads & jewellery making');
  assert.equal(discoveryGroup({ title: 'METAL LOCKET', category: 'FASHION JEWELLERY' }), 'Beads & jewellery making');
  assert.equal(discoveryGroup({ title: 'NECKLACE LOCKET HEART', category: 'FASHION JEWELLERY' }), 'Jewellery');
  // These are complete necklaces, not loose beads: the object noun wins.
  assert.equal(discoveryGroup({ title: 'NECKLACE RASTA SEEDBEADS', category: 'FASHION JEWELLERY' }), 'Jewellery');
  assert.equal(discoveryGroup({ title: 'NECKLACE MIYUKI BEADED', category: 'FASHION JEWELLERY' }), 'Jewellery');
  assert.equal(discoveryGroup({ title: 'EARRING PARTS 6MM', category: 'FASHION JEWELLERY' }), 'Beads & jewellery making');
  assert.equal(discoveryGroup({ title: 'METAL EARRING HOOKS', category: 'FASHION JEWELLERY' }), 'Beads & jewellery making');
  assert.notEqual(discoveryGroup({ title: 'CHAIN S/STEEL', category: 'FASHION JEWELLERY' }), 'Jewellery');
  assert.notEqual(discoveryGroup({ title: 'JEWELLERY DISPLAY BOX 7*7CM', category: 'FASHION JEWELLERY' }), 'Jewellery');
  assert.equal(discoveryGroup({ title: 'NECKLACE CRYSTAL HEART', category: 'FASHION JEWELLERY' }), 'Jewellery');
  assert.equal(discoveryGroup({ sku: '8605790101', title: 'CHAIN W/PENDANT PEACE', category: 'FASHION JEWELLERY' }), 'Jewellery');
  assert.equal(discoveryGroup({ title: 'CHAIN WITH PENDANT PEACE', category: 'FASHION JEWELLERY' }), 'Jewellery');
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

test('uses curated website artwork for the beads browse thumbnail', () => {
  const tiles = discoveryTiles([
    { sku: '8600000001', title: 'MAGNETIC CLASP', category: 'BEAD METAL PARTS', image: 'clasp.jpg' },
    { sku: '8618100133', title: 'BRACELET WOODEN BEADS', category: 'WOODEN BEADS', image: 'bracelet.jpg' },
  ]);
  const beads = tiles.find((tile) => tile.label === 'Beads & jewellery making');
  // Finished bracelets belong in their own customer category; the bead tile
  // must not borrow that product merely because its description says beads.
  assert.equal(beads?.sku, '8600000001');
  assert.equal(beads?.image, '/cat-beads.jpg');
});

test('uses the party artwork while keeping a non-fancy-dress representative', () => {
  const tiles = discoveryTiles([
    { sku: '8601897013', title: 'WITCHES NOSE CARDED', category: 'PARTY / FANCY DRES', image: 'witch.jpg' },
    { sku: '8602000001', title: 'PARTY BALLOONS ASSORTED', category: 'PARTY / FANCY DRES', image: 'balloons.jpg' },
  ]);
  const party = tiles.find((tile) => tile.label === 'Party items');
  assert.equal(party?.sku, '8602000001');
  assert.equal(party?.image, '/cat-events.jpg');
});

test('uses a dedicated website category visual for each browse category', () => {
  const tiles = discoveryTiles([
    { sku: '8600000001', title: 'SOFT TOY BEAR', category: 'SOFT TOYS', image: 'bear.jpg' },
    { sku: '8600000002', title: 'LIPSTICK PINK', category: 'COSMETICS SKIN CARE', image: 'lipstick.jpg' },
  ]);
  assert.equal(tiles.find((tile) => tile.label === 'Soft toys')?.image, '/cat-card-2.jpg');
  assert.equal(tiles.find((tile) => tile.label === 'Beauty')?.image, '/cat-beauty.jpg');
});
