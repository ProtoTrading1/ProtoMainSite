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

test('finds the whole eligible soft-toy range by everyday names and common misspellings', () => {
  const softToys = Array.from({ length: 81 }, (_, index) => ({
    sku: `86261${String(index).padStart(5, '0')}`,
    title: `SOFT TOY ASSORTED ${index + 1}`,
    originalDescription: `SOFT TOY ASSORTED ${index + 1}`,
    category: 'SOFT TOYS',
  }));

  for (const query of [
    'soft toy', 'soft toys', 'softtoy', 'softtoys', 'soft toyz', 'soft animal', 'plush', 'pluch', 'plsh',
    'teddy', 'teddies', 'tedi', 'stuffed animal', 'stuffed toys',
    'teddy bear', 'teddy bears', 'plushie', 'plushies', 'animal plush',
    'cuddly toy', 'cudly toy', 'softies', 'soft doll', 'soft dolls',
    'stufed animls', 'sotf toys', 'sotf toy', 'soft tosy',
  ]) {
    assert.equal(
      softToys.filter((product) => matchesInstoreSearch(product, query)).length,
      softToys.length,
      `all eligible soft toys are discoverable for "${query}"`,
    );
  }
});

test('normalizes common plural, joined-word and regional customer phrases', () => {
  const products = [
    { sku: 'PAINT001', title: 'PAINT BRUSH SET 3PC', category: 'STATIONERY/ART' },
    { sku: 'HAIR001', title: 'HAIR BRUSH ASSORTED', category: 'HAIR ACCESSORIES' },
    { sku: 'PENCIL001', title: 'COLOR PENCILS 12X2 COLOURS', category: 'STATIONERY/ART' },
    { sku: 'BAG001', title: 'DIY BACKPACK W/MARKERS', category: 'BAGS & WALLETS' },
    { sku: 'GLUE001', title: 'BEAD GLUE B6000 50ML', category: 'CRAFTS AND ALLIED' },
    { sku: 'NAIL001', title: 'NAIL GLUE', category: 'COSMETICS SKIN CARE' },
  ];

  for (const query of ['paint brushes', 'paintbrush', 'paintbrushes']) {
    assert.equal(matchesInstoreSearch(products[0], query), true, query);
  }
  for (const query of ['hair brushes', 'hairbrush', 'hairbrushes']) {
    assert.equal(matchesInstoreSearch(products[1], query), true, query);
  }
  for (const query of ['colour pencils', 'colored pencils', 'colouring pencils']) {
    assert.equal(matchesInstoreSearch(products[2], query), true, query);
  }
  for (const query of [
    'backpack', 'back pack', 'back packs', 'school bag', 'school bags', 'book bag',
    'bulk school bags', 'school bags wholesale', 'MOQ 12 school bags', 'box of 24 school bags', 'dozen school bags',
  ]) {
    assert.equal(matchesInstoreSearch(products[3], query), true, query);
  }
  for (const query of ['bead glue', 'beading glue', 'craft glue', 'craft adhesive']) {
    assert.equal(matchesInstoreSearch(products[4], query), true, query);
    assert.equal(matchesInstoreSearch(products[5], query), false, `${query} excludes nail glue`);
  }
});

test('keeps soft-toy synonyms out of cosmetics and non-toy plush materials', () => {
  const nonToys = [
    { sku: 'BEAUTY001', title: 'BEAUTY BLUSH PALETTE', category: 'COSMETICS SKIN CARE' },
    { sku: 'PEN001', title: 'PEN PLUSH LION', category: 'STATIONERY/ART' },
    { sku: 'WOOL001', title: 'WOOL PLUSH VELVET ±65M', category: 'CRAFTS AND ALLIED' },
  ];

  for (const product of nonToys) {
    assert.equal(matchesInstoreSearch(product, 'plush'), false, product.title);
    assert.equal(matchesInstoreSearch(product, 'pluch'), false, product.title);
  }
});

test('does not expand a short alias qualifier into an unrelated soft-toy prefix', () => {
  const products = [
    { sku: 'PENGUIN001', title: 'SOFT TOY PENGUIN', category: 'SOFT TOYS' },
    { sku: 'FOX001', title: 'SOFT TOY FOX', category: 'SOFT TOYS' },
    { sku: 'PEN001', title: 'PEN PLUSH LION', category: 'STATIONERY/ART' },
  ];

  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'plush pen')), []);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'toy pen')), []);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'plush fox')).map((product) => product.sku), ['FOX001']);
});

test('does not turn an unrelated five-letter query into a neighbouring product word', () => {
  const brushes = [
    { sku: 'BRUSH001', title: 'BARBER BRUSH', category: 'COSMETICS SKIN CARE' },
    { sku: 'BRUSH002', title: 'BLOW DRY BRUSH', category: 'HAIR ACCESSORIES' },
  ];
  assert.deepEqual(brushes.filter((product) => matchesInstoreSearch(product, 'blush')), []);
});

test('applies Phase 1 measurements, price, availability and colour intent deterministically', () => {
  const products = [
    { sku: '8626110059', title: 'SOFT TOY BLUE DOLPHIN ±50CM', originalDescription: 'SOFT TOY BLUE DOLPHIN ±50CM', category: 'SOFT TOYS', price: 89.99, stockQty: 14 },
    { sku: '8626110060', title: 'SOFT TOY BLUE DOLPHIN ±30CM', originalDescription: 'SOFT TOY BLUE DOLPHIN ±30CM', category: 'SOFT TOYS', price: 69.99, stockQty: 14 },
    { sku: '8626110061', title: 'SOFT TOY BLUE TEDDY', originalDescription: 'SOFT TOY BLUE TEDDY', category: 'SOFT TOYS', price: 79.99, stockQty: 12 },
    { sku: '8626110062', title: 'SOFT TOY BLUE TEDDY', originalDescription: 'SOFT TOY BLUE TEDDY', category: 'SOFT TOYS', price: 59.99, stockQty: 0 },
    { sku: '8626110063', title: 'SOFT TOY RABBIT', originalDescription: 'SOFT TOY RABBIT', category: 'SOFT TOYS', price: 149.99, stockQty: 12 },
  ];

  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'blue dolphin 50cm')).map((product) => product.sku), ['8626110059']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'soft toy 50 cm')).map((product) => product.sku), ['8626110059']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'cheap soft toys under R100')).map((product) => product.sku), ['8626110059', '8626110060', '8626110061', '8626110062']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'soft toys under 100 rand')).map((product) => product.sku), ['8626110059', '8626110060', '8626110061', '8626110062']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'soft toys R100 and below')).map((product) => product.sku), ['8626110059', '8626110060', '8626110061', '8626110062']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'soft toys below R100 incl VAT')).map((product) => product.sku), ['8626110059', '8626110060', '8626110061', '8626110062']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'in stock blue teddy')).map((product) => product.sku), ['8626110061']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'available blue teddy')).map((product) => product.sku), ['8626110061']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, '8626110059')).map((product) => product.sku), ['8626110059']);
  assert.deepEqual(products.filter((product) => matchesInstoreSearch(product, 'sku 8626110059')).map((product) => product.sku), ['8626110059']);
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

test('uses the reviewed soft-toy department for animal names that omit the object words', () => {
  const dolphin = { sku: 'DOLPHIN50', title: 'BLUE DOLPHIN 50CM', originalDescription: 'BLUE DOLPHIN 50CM', category: 'SOFT TOYS' };
  assert.equal(discoveryGroup(dolphin), 'Soft toys');
  for (const query of ['soft toys', 'plush', 'stuffed animal']) {
    assert.equal(matchesInstoreSearch(dolphin, query), true, query);
  }

  const sock = { sku: 'SOCK001', title: 'COTTON SOCKS ASSORTED', category: 'SOFT TOYS' };
  assert.notEqual(discoveryGroup(sock), 'Soft toys');
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

test('opens the unfiltered catalogue with beads before party items', () => {
  const beads = { sku: '8610000001', title: 'GLASS BEADS', category: 'STRING BEADS' };
  const party = { sku: '8600000001', title: 'GLOVES PARTY', category: 'PARTY / FANCY DRES' };
  assert.ok(compareInstoreSearch(beads, party, '') < 0);
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

test('uses a genuine toy or game image ahead of a newer source-department magnet', () => {
  const tiles = discoveryTiles([
    { sku: '8610000001', title: 'TOY CAR', category: 'TOYS + GAMES', image: 'toy-car.jpg' },
    { sku: '8690000001', title: 'MAGNET SET', category: 'TOYS + GAMES', image: 'magnet.jpg' },
  ]);
  const toys = tiles.find((tile) => tile.label === 'Toys & games');
  assert.equal(toys?.sku, '8610000001');
  assert.equal(toys?.image, 'toy-car.jpg');
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
