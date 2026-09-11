// Keep browse tiles grounded in Positill's department and DESCR fields.
// The labels are customer-friendly; the matching stays deterministic so a
// tile never becomes a fuzzy product recommendation.
const GROUPS = [
  // A handful of legacy rows carry the Soft Toys department even though their
  // descriptions are clothing. Keep those items browseable, but never let
  // them appear under a customer-facing Soft toys tile.
  ['Soft toys', { departments: ['soft toys'], terms: ['soft', 'plush', 'teddy', 'stuffed'], exclude: ['sock', 'legging', 'tight', 'warmer', 'glove', 'boot'] }],
  ['Toys & games', { departments: ['toys games'], terms: ['toy', 'doll', 'puzzle', 'game'] }],
  ['Party items', { departments: ['party fancy dres', 'party accessories'], terms: ['party', 'balloon', 'crown', 'pirate'] }],
  ['Bracelets', { terms: ['bracelet', 'bangle'] }],
  ['Hair accessories', { departments: ['hair accessories'], terms: ['hair', 'scrunchie', 'headband'] }],
  ['Bags & wallets', { departments: ['bags wallets'], terms: ['bag', 'purse', 'wallet'] }],
  // Jewellery is for finished, ready-to-wear pieces. Beads, pendants, jump
  // rings and other components belong under jewellery making instead.
  ['Jewellery', { terms: ['necklace', 'earring', 'ring', 'locket'], exclude: ['jump', 'bead', 'pendant', 'charm', 'clasp', 'finding', 'keyring', 'carabina', 'chain', 'display', 'box', 'stand', 'card', 'tray'] }],
  ['Beads & jewellery making', { departments: ['string beads', 'bead metal parts', 'bead accessories', 'chain', 'wooden beads', 'beads seed acrylic'], terms: ['bead', 'chain', 'pendant', 'finding'] }],
  ['Stationery & art', { departments: ['stationery art', 'arts', 'scrapbooking'], terms: ['pen', 'pencil', 'notebook', 'stationery', 'sticker'] }],
  ['Crafts & DIY', { departments: ['craft parts', 'crafts and allied', 'haberdashery'], terms: ['craft', 'diy', 'wool', 'ribbon'] }],
  ['Home & kitchen', { departments: ['household'], terms: ['kitchen', 'spoon', 'mug', 'cup', 'plate', 'bowl'] }],
  ['Beauty', { departments: ['cosmetics skin care'], terms: ['lipstick', 'makeup', 'cosmetic', 'beauty'] }],
];

function words(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((word) => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word);
}

function productText(product) {
  return [product?.name, product?.title, product?.originalDescription, product?.category]
    .filter(Boolean).join(' ');
}

// A browse tile should feel like the catalogue: lead with a recognisable
// finished item, not a clasp, spare part or other component that merely happens
// to sort first by SKU. These are deterministic description rules; they do not
// alter product eligibility, availability, or the displayed search results.
const THUMBNAIL_RULES = {
  'Beads & jewellery making': {
    prefer: ['bracelet', 'bead', 'necklace', 'pendant', 'earring'],
    avoid: ['clasp', 'crimp', 'finding', 'chain', 'pin', 'jump ring'],
  },
  Jewellery: {
    prefer: ['necklace', 'earring', 'ring', 'bracelet', 'bangle', 'pendant'],
    avoid: ['clasp', 'crimp', 'finding', 'chain', 'pin'],
  },
  Bracelets: { prefer: ['bracelet', 'bangle'], avoid: ['clasp', 'chain', 'finding'] },
  'Soft toys': { prefer: ['teddy', 'bear', 'plush', 'soft toy', 'stuffed'], avoid: [] },
  'Toys & games': { prefer: ['toy', 'doll', 'puzzle', 'game'], avoid: [] },
  // Keep the Party tile welcoming and product-led. Fancy-dress products stay
  // searchable, but masks, wigs and costume accessories should not become the
  // visual face of this category.
  'Party items': {
    prefer: ['balloon', 'banner', 'bunting', 'serviette', 'cup', 'plate', 'candle', 'confetti'],
    avoid: ['witch', 'costume', 'fancy dress', 'mask', 'wig', 'beard', 'mustache', 'nose', 'teeth', 'tattoo', 'cigar', 'hook', 'sword', 'gun', 'gloves', 'leggings', 'skirt', 'sash', 'ears'],
  },
  'Hair accessories': { prefer: ['hair', 'scrunchie', 'headband', 'clip'], avoid: [] },
  'Bags & wallets': { prefer: ['bag', 'purse', 'wallet'], avoid: [] },
  'Stationery & art': { prefer: ['notebook', 'pen', 'pencil', 'sticker', 'paint'], avoid: [] },
  'Crafts & DIY': { prefer: ['craft', 'ribbon', 'wool', 'paint', 'brush'], avoid: [] },
  'Home & kitchen': { prefer: ['mug', 'cup', 'plate', 'bowl', 'kitchen'], avoid: [] },
  Beauty: { prefer: ['lipstick', 'makeup', 'cosmetic', 'beauty'], avoid: [] },
};

// These are the finished category visuals already used by Proto's public
// catalogue. They are decorative entry points, not a claim about the stock or
// appearance of a particular item: the product grid remains the source of
// truth for individual images, prices, and availability.
const CURATED_TILE_IMAGES = {
  'Beads & jewellery making': '/cat-beads.jpg',
  Jewellery: '/cat-fashion.jpg',
  'Stationery & art': '/cat-arts.jpg',
  'Home & kitchen': '/cat-homeware.jpg',
  'Bags & wallets': '/cat-fashion.jpg',
  'Party items': '/cat-events.jpg',
  'Crafts & DIY': '/cat-textiles.jpg',
  'Toys & games': '/cat-toys.jpg',
  'Soft toys': '/cat-card-2.jpg',
  Beauty: '/cat-beauty.jpg',
  'Hair accessories': '/cat-fashion.jpg',
  Bracelets: '/cat-beads.jpg',
  'More finds': '/cat-card-3.jpg',
};

function thumbnailScore(product, label) {
  const text = productText(product).toLowerCase();
  const rule = THUMBNAIL_RULES[label] || { prefer: [], avoid: [] };
  const matches = (term) => text.includes(term);
  return rule.prefer.reduce((score, term) => score + (matches(term) ? 10 : 0), 0)
    - rule.avoid.reduce((score, term) => score + (matches(term) ? 20 : 0), 0);
}

export function discoveryGroup(product) {
  const tokens = words(productText(product));
  // Do not singularise the Positill department value — it is an exact,
  // controlled label (for example, "PARTY / FANCY DRES").
  const department = String(product?.category || '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  // A Positill department is more precise than a generic word in DESCR:
  // "PARTY TOY CLUB" belongs in Party items, not Toys & games.
  const permitted = (rule) => !rule.exclude?.some((term) => tokens.includes(term));
  // A controlled Positill department remains more reliable than a generic
  // word in a description (for example, PARTY TOY CLUB is a party product).
  return GROUPS.find(([, rule]) => permitted(rule) && rule.departments?.includes(department))?.[0]
    || GROUPS.find(([, rule]) => permitted(rule) && rule.terms?.some((term) => tokens.includes(term)))?.[0]
    || 'More finds';
}

export function matchesInstoreSearch(product, query) {
  const terms = words(query);
  const tokens = words(`${productText(product)} ${discoveryGroup(product)} ${product?.sku || ''} ${product?.barcode || ''}`);
  return terms.every((term) => tokens.some((token) => token.startsWith(term) || (term === 'wood' && token === 'wooden')));
}

// Search should feel like a customer catalogue, not a database filter. Keep
// matching broad, but put products whose description begins with the shopper's
// words ahead of indirect/category matches.
export function compareInstoreSearch(left, right, query) {
  const terms = words(query);
  if (!terms.length) return 0;
  const score = (product) => {
    const name = words(product?.name || product?.title || product?.originalDescription);
    const all = words(productText(product));
    return terms.reduce((total, term) => total
      + (name[0] === term ? 100 : 0)
      + (name.includes(term) ? 30 : 0)
      + (all.includes(term) ? 5 : 0), 0);
  };
  const difference = score(right) - score(left);
  return difference || String(left?.name || left?.title || '').localeCompare(String(right?.name || right?.title || ''));
}

export function discoveryTiles(products) {
  const tiles = new Map();
  for (const product of products || []) {
    const label = discoveryGroup(product);
    const candidate = {
      sku: product.sku,
      image: CURATED_TILE_IMAGES[label] || product.image,
      score: thumbnailScore(product, label),
    };
    const tile = tiles.get(label) || { label, ...candidate, count: 0 };
    tile.count += 1;
    // Use SKU as a stable tie-breaker, so a tile does not change merely because
    // a database page is returned in a different order.
    if (candidate.score > tile.score
      || (candidate.score === tile.score && String(candidate.sku || '').localeCompare(String(tile.sku || '')) < 0)) {
      tile.sku = candidate.sku;
      tile.image = candidate.image;
      tile.score = candidate.score;
    }
    tiles.set(label, tile);
  }
  // Start customers in Proto's strongest discovery department. Everything
  // remains available; this only controls the order of the browse shortcuts.
  const priority = ['Beads & jewellery making', 'Jewellery', 'Bracelets'];
  const rank = (label) => {
    if (label === 'More finds') return priority.length + 1;
    const index = priority.indexOf(label);
    if (index !== -1) return index;
    return priority.length - 1;
  };
  return [...tiles.values()].sort((a, b) => rank(a.label) - rank(b.label)
    || b.count - a.count || a.label.localeCompare(b.label))
    .map(({ score, ...tile }) => tile);
}
