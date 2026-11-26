import { classifyInstoreProduct } from './instore-classification.mjs';
import { instoreOptionSearchText } from './instore-option-search.mjs';
import { isAlphabeticSuffixVariant, isIdentifierQuery, normalizeIdentifier } from '../src/lib/identifierNormalize.js';
import {
  parseSearchQuery, productMatchesSearchIntent, searchQueryUsesFamily, searchQueryVariants, singularizeSearchWord, normalizeSearchCompounds, searchTypoMatch,
} from './search-language.mjs';

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
  return normalizeSearchCompounds(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map(singularizeSearchWord);
}

function productText(product) {
  return [product?.name, product?.title, product?.originalDescription, product?.description, product?.brand, product?.category, instoreOptionSearchText(product)]
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

// Classifying and tokenising a product are pure functions of fields that are
// never mutated once a product object is built, and the same objects are walked
// several times per request or per search: once while the feed is built, again
// by the filter, again by the sort, again by the tiles. Memoising per object
// keeps thousands of products browsable in the browser without changing a
// single outcome. A caller that mutates a product's description after it has
// been classified would keep the earlier answer; nothing does.
const groupByProduct = new WeakMap();
const tokensByProduct = new WeakMap();

function memoize(store, product, compute) {
  if (!product || typeof product !== 'object') return compute();
  if (store.has(product)) return store.get(product);
  const value = compute();
  store.set(product, value);
  return value;
}

export function discoveryGroup(product) {
  if (typeof product?.sourceDiscoveryGroup === 'string') return product.sourceDiscoveryGroup;
  return memoize(groupByProduct, product, () => classifyInstoreProduct(product).category);
}

// The customer's words and a product's searchable words come from the same
// normaliser. Exported so the stored Instore read model can hold exactly the
// tokens this matcher compares against, rather than a second dialect of them.
export function searchTerms(query) {
  return searchTermSets(query)[0] || [];
}

export function searchTermSets(query) {
  return searchQueryVariants(query).map((variant) => [...new Set(words(variant))]);
}

export function instoreSearchTokens(product) {
  return memoize(tokensByProduct, product, () => words(`${productText(product)} ${discoveryGroup(product)} ${product?.sku || ''} ${product?.barcode || ''}`));
}

// Compile customer-language interpretation once for the whole result set.
// This context is local to one search, so queries and product ranks cannot
// leak across requests or survive a refreshed catalogue.
function createInstoreMatcher(query) {
  const raw = String(query || '').trim();
  if (!raw) return () => true;
  const bareModelQuery = /^(?=.*[a-z])(?=.*\d)[a-z0-9]+$/i.test(raw);
  if (isIdentifierQuery(query) || bareModelQuery) {
    const identifier = normalizeIdentifier(query);
    return (product) => {
      const identifierMatch = [product?.sku, product?.barcode].filter(Boolean).some((value) => {
        const candidate = normalizeIdentifier(value);
        return candidate === identifier || isAlphabeticSuffixVariant(candidate, identifier);
      });
      return identifierMatch || (bareModelQuery
        && words(`${product?.name || ''} ${product?.title || ''}`).includes(raw.toLowerCase()));
    };
  }
  const shortPrefix = /^[a-z]{3}$/i.test(raw) ? raw.toLowerCase() : null;
  const intent = parseSearchQuery(query);
  const objectQuery = ['wallet', 'handbag', 'backpack', 'notebook', 'hair clip', 'hair tie', 'paint brush', 'hair brush']
    .some((family) => searchQueryUsesFamily(query, family)) || /\bbags?\b/.test(intent.text);
  const alternatives = searchTermSets(query);
  const isSoftToyFamily = searchQueryUsesFamily(query, 'soft toy');
  const allowGenericTypo = alternatives.length === 1;
  return (product) => {
    // Short code prefixes retain their identifier-first bypass of language gates.
    if (shortPrefix && /^[a-z0-9]+$/i.test(String(product?.sku || '').trim())
        && String(product.sku).trim().toLowerCase().startsWith(shortPrefix)) return true;
    if (!productMatchesSearchIntent(product, intent)) return false;
    const tokens = objectQuery
      ? words([product?.name, product?.title, product?.originalDescription, product?.description,
        product?.brand, product?.sku, product?.barcode, instoreOptionSearchText(product)].filter(Boolean).join(' '))
      : instoreSearchTokens(product);
    if (!alternatives.length) return true;
    if (isSoftToyFamily && discoveryGroup(product) !== 'Soft toys') return false;
    return alternatives.some((terms) => terms.every((term) => tokens.some((token) => token === term
      || ((term.length >= 4 || term === 'dia') && /^[a-z]+$/.test(term) && token.startsWith(term))
      || (term === 'wood' && token === 'wooden')
      || (allowGenericTypo && searchTypoMatch(term, token)))));
  };
}

export function matchesInstoreSearch(product, query) {
  return createInstoreMatcher(query)(product);
}

// Search should feel like a customer catalogue, not a database filter. Keep
// matching broad, but put products whose description begins with the shopper's
// words ahead of indirect/category matches.
function createInstoreComparator(query) {
  const identifierQuery = isIdentifierQuery(query) || /^20\d{2}$/.test(String(query).trim()) || /^(?=.*[a-z])(?=.*\d)[a-z0-9]+$/i.test(String(query).trim());
  const identifier = identifierQuery ? normalizeIdentifier(query) : null;
  const normalizedTitle = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const queryTitle = normalizedTitle(query);
  const hasQuery = Boolean(String(query || '').trim());
  const terms = words(parseSearchQuery(query).text);
  const landingGroups = ['Beads & jewellery making', 'Jewellery', 'Bracelets'];
  const ranks = new WeakMap();
  const rank = (product) => memoize(ranks, product, () => {
    const name = String(product?.name || product?.title || '');
    const nameWords = terms.length ? words(product?.name || product?.title || product?.originalDescription) : [];
    const all = terms.length ? words(productText(product)) : [];
    const groupIndex = terms.length ? -1 : landingGroups.indexOf(discoveryGroup(product));
    return {
      name,
      identifier: identifierQuery ? String(product?.sku || '').toLowerCase() === String(query).trim().toLowerCase() ? 4
        : String(product?.barcode || '').toLowerCase() === String(query).trim().toLowerCase() ? 3
        : normalizeIdentifier(product?.sku) === identifier ? 2
        : normalizeIdentifier(product?.barcode) === identifier ? 1 : 0 : 0,
      exact: Number(hasQuery && normalizedTitle(name) === queryTitle),
      landing: groupIndex === -1 ? landingGroups.length : groupIndex,
      score: terms.reduce((total, term) => total
        + (nameWords[0] === term ? 100 : 0)
        + (nameWords.includes(term) ? 30 : 0)
        + (all.includes(term) ? 5 : 0), 0),
    };
  });
  return (left, right) => {
    const a = rank(left), b = rank(right);
    const leading = b.identifier - a.identifier || b.exact - a.exact;
    if (leading) return leading;
    if (!terms.length) {
      return a.landing - b.landing || a.name.localeCompare(b.name)
        || compareProductCodes(left?.sku, right?.sku);
    }
    return b.score - a.score || a.name.localeCompare(b.name);
  };
}

export function compareInstoreSearch(left, right, query) {
  return createInstoreComparator(query)(left, right);
}

export function prepareInstoreSearch(query) {
  return { matches: createInstoreMatcher(query), compare: createInstoreComparator(query) };
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
