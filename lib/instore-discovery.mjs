// Keep browse tiles grounded in Positill's department and DESCR fields.
// The labels are customer-friendly; the matching stays deterministic so a
// tile never becomes a fuzzy product recommendation.
const GROUPS = [
  ['Soft toys', { departments: ['soft toys'], terms: ['soft', 'plush', 'teddy', 'stuffed'] }],
  ['Toys & games', { departments: ['toys games'], terms: ['toy', 'doll', 'puzzle', 'game'] }],
  ['Party items', { departments: ['party fancy dres', 'party accessories'], terms: ['party', 'balloon', 'crown', 'pirate'] }],
  ['Bracelets', { terms: ['bracelet', 'bangle'] }],
  ['Hair accessories', { departments: ['hair accessories'], terms: ['hair', 'scrunchie', 'headband'] }],
  ['Bags & wallets', { departments: ['bags wallets'], terms: ['bag', 'purse', 'wallet'] }],
  ['Jewellery', { departments: ['fashion jewellery', 'pendnts braclts rngs'], terms: ['necklace', 'earring', 'jewellery', 'jewelry', 'ring'] }],
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

export function discoveryGroup(product) {
  const tokens = words(productText(product));
  // Do not singularise the Positill department value — it is an exact,
  // controlled label (for example, "PARTY / FANCY DRES").
  const department = String(product?.category || '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  // A Positill department is more precise than a generic word in DESCR:
  // "PARTY TOY CLUB" belongs in Party items, not Toys & games.
  return GROUPS.find(([, rule]) => rule.departments?.includes(department))?.[0]
    || GROUPS.find(([, rule]) => rule.terms?.some((term) => tokens.includes(term)))?.[0]
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
    const tile = tiles.get(label) || { label, image: product.image, count: 0 };
    tile.count += 1;
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
    || b.count - a.count || a.label.localeCompare(b.label));
}
