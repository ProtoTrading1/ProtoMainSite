import { classifyInstoreProduct } from './instore-classification.mjs';
import { fuzzyFilter } from '../src/lib/fuzzySearch.js';

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
  ['Jewellery', { terms: ['necklace', 'earring', 'ring'], exclude: ['jump', 'bead', 'beaded', 'seedbead', 'miyuki', 'pendant', 'charm', 'clasp', 'finding', 'keyring', 'carabina', 'chain', 'display', 'box', 'stand', 'card', 'tray', 'part', 'hook', 'end', 'pin', 'crimp', 'spring', 'wire', 'loop', 'spacer'] }],
  ['Beads & jewellery making', { departments: ['string beads', 'bead metal parts', 'bead accessories', 'chain', 'wooden beads', 'beads seed acrylic'], terms: ['bead', 'beaded', 'seedbead', 'miyuki', 'chain', 'pendant', 'finding', 'locket', 'jump', 'charm', 'clasp', 'part', 'hook', 'end', 'pin', 'crimp', 'spring', 'wire', 'loop', 'spacer'] }],
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

function isSafeTileCandidate(product, label) {
  const text = productText(product).toLowerCase();
  const rule = THUMBNAIL_RULES[label] || { prefer: [], avoid: [] };
  return !rule.avoid.some((term) => text.includes(term));
}

function tileCandidateQuality(product, label) {
  if (!isSafeTileCandidate(product, label)) return 0;
  const rule = THUMBNAIL_RULES[label] || { prefer: [] };
  // Do not let a source department such as "Toys + games" make a magnet
  // appear to be a toy; preference must come from the product description.
  const text = [product?.name, product?.title, product?.originalDescription]
    .filter(Boolean).join(' ').toLowerCase();
  // A recognisable product comes before a merely safe source-department row.
  // The code then selects the newest item within that customer-true set.
  return rule.prefer.some((term) => text.includes(term)) ? 2 : 1;
}

// Codes are the source-system chronology agreed for Instore tiles. Natural
// comparison keeps numeric codes and valid trailing variant suffixes stable.
const codeCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function compareProductCodes(left, right) {
  return codeCollator.compare(String(left || ''), String(right || ''));
}

export function discoveryGroup(product) {
  return classifyInstoreProduct(product).category;
}

export function matchesInstoreSearch(product, query) {
  const terms = words(query);
  const tokens = words(`${productText(product)} ${discoveryGroup(product)} ${product?.sku || ''} ${product?.barcode || ''}`);
  return terms.every((term) => tokens.some((token) => token.startsWith(term) || (term === 'wood' && token === 'wooden')));
}

// Instore is a separate eligibility-controlled catalogue, but customers should
// not have to learn a second search language. Reuse the storefront's proven
// relevance engine for exact codes, barcodes, descriptions, customer wording,
// and small spelling mistakes after the Instore gate has already run.
export function filterInstoreSearch(products, query = '', category = '') {
  const scoped = (products || []).filter((product) => !category || discoveryGroup(product) === category);
  const normalized = String(query || '').trim();
  if (normalized) {
    const fuzzyMatches = fuzzyFilter(scoped, normalized);
    if (fuzzyMatches.length) return fuzzyMatches;
    // Preserve the established Instore shorthand "wood" → "wooden" when
    // the shared engine has no result, without diluting its ranked matches.
    return scoped.filter((product) => matchesInstoreSearch(product, normalized))
      .sort((left, right) => compareInstoreSearch(left, right, normalized));
  }
  return [...scoped].sort((left, right) => compareInstoreSearch(left, right, ''));
}

// Search should feel like a customer catalogue, not a database filter. Keep
// matching broad, but put products whose description begins with the shopper's
// words ahead of indirect/category matches.
export function compareInstoreSearch(left, right, query) {
  const terms = words(query);
  // The unfiltered landing page is a shop window, not an import-order list.
  // Lead with Proto's strongest discovery ranges and leave Party items for an
  // explicit browse choice or a matching customer search.
  if (!terms.length) {
    const landingGroups = ['Beads & jewellery making', 'Jewellery', 'Bracelets'];
    const landingRank = (product) => {
      const index = landingGroups.indexOf(discoveryGroup(product));
      return index === -1 ? landingGroups.length : index;
    };
    const rankDifference = landingRank(left) - landingRank(right);
    return rankDifference || String(left?.name || left?.title || '').localeCompare(String(right?.name || right?.title || ''))
      || compareProductCodes(left?.sku, right?.sku);
  }
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
  let latest86181Jewellery = null;
  for (const product of products || []) {
    const label = discoveryGroup(product);
    const candidate = {
      sku: product.sku,
      image: product.image,
      quality: tileCandidateQuality(product, label),
    };
    const tile = tiles.get(label) || { label, ...candidate, count: 0 };
    tile.count += 1;
    // Each tile uses the newest safe item in its group, represented by the
    // highest natural product code. This keeps its photograph in step with
    // the latest received stock instead of freezing a generic category image.
    if (candidate.quality > tile.quality
      || (candidate.quality === tile.quality && compareProductCodes(candidate.sku, tile.sku) > 0)) {
      tile.sku = candidate.sku;
      tile.image = candidate.image;
      tile.quality = candidate.quality;
    }
    tiles.set(label, tile);
    // The 86181 range is Proto's current, customer-appropriate bracelet
    // range. Use its newest safe item as the Jewellery tile representative
    // rather than allowing unrelated historical product names to lead it.
    if (label === 'Bracelets' && String(product.sku || '').startsWith('86181')
      && tileCandidateQuality(product, 'Bracelets') > 0
      && (!latest86181Jewellery || compareProductCodes(product.sku, latest86181Jewellery.sku) > 0)) {
      latest86181Jewellery = product;
    }
  }
  const jewelleryTile = tiles.get('Jewellery');
  if (jewelleryTile && latest86181Jewellery) {
    jewelleryTile.sku = latest86181Jewellery.sku;
    jewelleryTile.image = latest86181Jewellery.image;
  }
  const braceletsTile = tiles.get('Bracelets');
  if (braceletsTile && latest86181Jewellery) {
    braceletsTile.sku = latest86181Jewellery.sku;
    braceletsTile.image = latest86181Jewellery.image;
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
    .map(({ quality, ...tile }) => tile);
}
