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
  assert.equal(discoveryGroup({ sku: '8613010026', title: 'S/PRECIOUS CHIPS CROAL', category: 'STATIONERY/ART' }), 'Beads & jewellery making');
  assert.equal(discoveryGroup({ title: 'S/PRECIOUS STONE 6MM TIGER EYE', category: 'STATIONERY/ART' }), 'Beads & jewellery making');
  assert.equal(discoveryGroup({ title: 'SEMIPRECIOUS STONES ASSORTED', category: 'STATIONERY/ART' }), 'Beads & jewellery making');
  assert.equal(discoveryGroup({ title: 'GEMSTONES ASSORTED', category: 'STATIONERY/ART' }), 'Beads & jewellery making');
  assert.equal(discoveryGroup({ title: 'NECKLACE SEMI PRECIOUS AMETHYST', category: 'FASHION JEWELLERY' }), 'Jewellery');
  assert.equal(discoveryGroup({ title: 'EARRINGS SEMI PRECIOUS QUARTZ', category: 'FASHION JEWELLERY' }), 'Jewellery');
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

test('uses the highest product code and its current image for a browse tile', () => {
  const tiles = discoveryTiles([
    { sku: '8618100133', title: 'WOODEN BEADS', category: 'WOODEN BEADS', image: 'older-beads.jpg' },
    { sku: '8628100133A', title: 'GLASS BEADS', category: 'WOODEN BEADS', image: 'newest-beads.jpg' },
  ]);
  const beads = tiles.find((tile) => tile.label === 'Beads & jewellery making');
  assert.equal(beads?.sku, '8628100133A');
  assert.equal(beads?.image, 'newest-beads.jpg');
});

test('uses the current 86181 bracelet range for the Jewellery tile', () => {
  const tiles = discoveryTiles([
    { sku: '8633680429', title: 'TERRORIST NECKLACE', category: 'FASHION JEWELLERY', image: 'historical-necklace.jpg' },
    { sku: '8618100319', title: 'BRACELET ASSORTED', category: 'FASHION JEWELLERY', image: 'bracelet-range.jpg' },
    { sku: '8618100523', title: 'BRACELET S/STEEL', category: 'FASHION JEWELLERY', image: 'newest-bracelet-range.jpg' },
  ]);
  const jewellery = tiles.find((tile) => tile.label === 'Jewellery');
  const bracelets = tiles.find((tile) => tile.label === 'Bracelets');
  assert.equal(jewellery?.sku, '8618100523');
  assert.equal(jewellery?.image, 'newest-bracelet-range.jpg');
  assert.equal(bracelets?.sku, '8618100523');
  assert.equal(bracelets?.image, 'newest-bracelet-range.jpg');
});

test('keeps unsuitable fancy-dress products out of the Party tile', () => {
  const tiles = discoveryTiles([
    { sku: '8601897013', title: 'WITCHES NOSE CARDED', category: 'PARTY / FANCY DRES', image: 'witch.jpg' },
    { sku: '8602000001', title: 'PARTY BALLOONS ASSORTED', category: 'PARTY / FANCY DRES', image: 'balloons.jpg' },
    { sku: '8699999999', title: 'PIRATE COSTUME', category: 'PARTY / FANCY DRES', image: 'costume.jpg' },
  ]);
  const party = tiles.find((tile) => tile.label === 'Party items');
  assert.equal(party?.sku, '8602000001');
  assert.equal(party?.image, 'balloons.jpg');
});

test('uses current product images instead of a frozen category artwork', () => {
  const tiles = discoveryTiles([
    { sku: '8600000001', title: 'SOFT TOY BEAR', category: 'SOFT TOYS', image: 'bear.jpg' },
    { sku: '8600000003', title: 'NECKLACE PEACE', category: 'FASHION JEWELLERY', image: 'necklace.jpg' },
    { sku: '8600000004', title: 'MISCELLANEOUS ITEM', category: 'UNSORTED', image: 'misc.jpg' },
    { sku: '8600000002', title: 'LIPSTICK PINK', category: 'COSMETICS SKIN CARE', image: 'lipstick.jpg' },
  ]);
  assert.equal(tiles.find((tile) => tile.label === 'Jewellery')?.image, 'necklace.jpg');
  assert.equal(tiles.find((tile) => tile.label === 'Soft toys')?.image, 'bear.jpg');
  assert.equal(tiles.find((tile) => tile.label === 'More finds')?.image, 'misc.jpg');
  assert.equal(tiles.find((tile) => tile.label === 'Beauty')?.image, 'lipstick.jpg');
});

test('covers every visible browse category with a current product image', () => {
  const fixtures = [
    ['BEADS', 'WOODEN BEADS'], ['FASHION JEWELLERY', 'NECKLACE GOLD'],
    ['STATIONERY/ART', 'NOTEBOOK'], ['HOUSEHOLD', 'MUG'],
    ['BAGS & WALLETS', 'PURSE'], ['PARTY / FANCY DRES', 'PARTY BALLOONS'],
    ['CRAFTS AND ALLIED', 'RIBBON'], ['TOYS + GAMES', 'TOY CAR'],
    ['SOFT TOYS', 'SOFT TOY BEAR'], ['COSMETICS SKIN CARE', 'LIPSTICK'],
    ['HAIR ACCESSORIES', 'HAIR CLIP'], ['FASHION JEWELLERY', 'BRACELET'],
    ['', 'UNIDENTIFIED OBJECT'],
  ].map(([category, title], index) => ({ sku: String(index), category, title, image: `fixture-${index}.jpg` }));
  const images = Object.fromEntries(discoveryTiles(fixtures).map((tile) => [tile.label, tile.image]));
  assert.deepEqual(images, {
    'Beads & jewellery making': 'fixture-0.jpg',
    Jewellery: 'fixture-1.jpg',
    'Stationery & art': 'fixture-2.jpg',
    'Home & kitchen': 'fixture-3.jpg',
    'Bags & wallets': 'fixture-4.jpg',
    'Party items': 'fixture-5.jpg',
    'Crafts & DIY': 'fixture-6.jpg',
    'Toys & games': 'fixture-7.jpg',
    'Soft toys': 'fixture-8.jpg',
    Beauty: 'fixture-9.jpg',
    'Hair accessories': 'fixture-10.jpg',
    Bracelets: 'fixture-11.jpg',
    'More finds': 'fixture-12.jpg',
  });
});
