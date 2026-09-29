// Customer language shared by the main catalogue and Instore Products.
// These are equivalence families, not recommendations: every variant remains
// subject to the catalogue's existing visibility, stock, price and image gates.
const SEARCH_FAMILIES = [
  ['soft toy', ['soft toys', 'softtoy', 'softies', 'plush', 'plush toy', 'plush toys', 'pluch', 'plsh', 'teddy', 'teddies', 'tedi', 'stuffed animal', 'stuffed animals', 'stuffed toy', 'stuffed toys', 'cuddly toy', 'cuddly toys', 'cudly toy']],
  ['wallet', ['wallets', 'purse', 'purses']],
  ['handbag', ['hand bag', 'hand bags', 'handbags']],
  ['mobile phone', ['cell phone', 'cell phones', 'cellphone', 'cellphones', 'smartphone', 'smartphones']],
  ['stationery', ['stationary']],
  ['jewellery', ['jewelry']],
  ['earring back', ['earring backs', 'butterfly back', 'butterfly backs']],
  ['gift bag', ['gift bags', 'paper bag', 'paper bags', 'carrier bag', 'carrier bags']],
  ['hair clip', ['hair clips', 'hairpin', 'hairpins', 'barrette', 'barrettes']],
  ['hair tie', ['hair ties', 'ponytail holder', 'ponytail holders']],
  ['scrunchie', ['scrunchies']],
  ['notebook', ['notebooks', 'notepad', 'notepads']],
  ['colouring', ['coloring']],
];

const COLOURS = new Map([
  ['black', 'black'], ['white', 'white'], ['red', 'red'], ['blue', 'blue'],
  ['green', 'green'], ['yellow', 'yellow'], ['pink', 'pink'], ['purple', 'purple'],
  ['orange', 'orange'], ['brown', 'brown'], ['grey', 'grey'], ['gray', 'grey'],
  ['silver', 'silver'], ['gold', 'gold'], ['beige', 'beige'], ['cream', 'cream'],
  ['navy', 'navy'], ['teal', 'teal'], ['turquoise', 'turquoise'],
  ['multicolour', 'multicolour'], ['multicolor', 'multicolour'], ['clear', 'clear'],
]);

const SIZES = new Map([
  ['xxs', 'xxs'], ['extra extra small', 'xxs'],
  ['xs', 'xs'], ['extra small', 'xs'],
  ['small', 'small'], ['medium', 'medium'], ['large', 'large'],
  ['xl', 'xl'], ['extra large', 'xl'],
  ['xxl', 'xxl'], ['2xl', 'xxl'], ['extra extra large', 'xxl'],
  ['xxxl', 'xxxl'], ['3xl', 'xxxl'],
  ['one size', 'one size'], ['one size fits all', 'one size'],
]);

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function identifierLike(value) {
  const raw = String(value || '').trim();
  if (/\s/.test(raw)) return false;
  const compact = raw.replace(/[_-]+/g, '');
  return /^(?=.*\d)[a-z0-9]+$/i.test(compact);
}

function removePhrase(value, phrase) {
  return replacePhrase(value, phrase, ' ');
}

function productRawText(product) {
  return [
    product?.name, product?.title, product?.description, product?.originalDescription,
    product?.colour, product?.color, product?.size, product?.style,
    product?.category, product?.categoryLabel, ...(product?.categoryPath || []),
  ].filter(Boolean).join(' ');
}

function normalizedProductText(product) {
  return normalize(productRawText(product));
}

const MEASUREMENT_PATTERN = /\b(\d+(?:[.,]\d+)?)\s*(mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|met(?:er|re)s?)\b/gi;

function canonicalMeasurement(amount, unit) {
  const numeric = Number(String(amount).replace(',', '.'));
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  const normalizedUnit = String(unit || '').toLowerCase();
  const centimetres = normalizedUnit === 'mm' || normalizedUnit.startsWith('millimet')
    ? numeric / 10
    : normalizedUnit === 'm' || normalizedUnit.startsWith('met')
      ? numeric * 100
      : numeric;
  const rounded = Math.round(centimetres * 1000) / 1000;
  return `${rounded}cm`;
}

function extractMeasurements(value) {
  const measurements = [];
  const remaining = String(value || '').replace(MEASUREMENT_PATTERN, (_match, amount, unit) => {
    const measurement = canonicalMeasurement(amount, unit);
    if (measurement) measurements.push(measurement);
    return ' ';
  });
  return { remaining, measurements: [...new Set(measurements)] };
}

function productPrice(product) {
  for (const value of [
    product?.priceInclVat, product?.price_incl_vat, product?.sellingPrice, product?.price,
    product?.unitPrice, product?.unit_price,
  ]) {
    if (value === undefined || value === null || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  return null;
}

function productHasStock(product) {
  for (const value of [
    product?.stockOnHand, product?.stockQty, product?.available_stock, product?.stock_qty,
  ]) {
    if (value === undefined || value === null || value === '') continue;
    const number = Number(value);
    return Number.isFinite(number) && number > 0;
  }
  if (product?.inStock === true) return true;
  return ['in_stock', 'low_stock'].includes(String(product?.availability?.state || '').toLowerCase());
}

/**
 * Split deterministic shopping constraints from the words used for lexical
 * retrieval. Exact identifiers bypass interpretation so a SKU containing a
 * colour name or size suffix can never be rewritten.
 */
export function parseSearchQuery(value) {
  const raw = String(value || '').trim();
  if (!raw) return { text: '', priceMax: null, inStock: false, colours: [], sizes: [], measurements: [] };
  if (identifierLike(raw)) {
    return { text: normalize(raw), priceMax: null, inStock: false, colours: [], sizes: [], measurements: [] };
  }

  const measured = extractMeasurements(raw);
  let text = normalize(measured.remaining);
  const measurements = measured.measurements;

  let priceMax = null;
  text = text.replace(/\b(?:under|below|less than|up to|maximum|max)\s*(?:r|zar)?\s*(\d+(?:[.,]\d{1,2})?)\b/g, (_match, amount) => {
    priceMax = Number(String(amount).replace(',', '.'));
    return ' ';
  });

  let inStock = false;
  text = text.replace(/\b(?:in stock|available now|currently available)\b/g, () => {
    inStock = true;
    return ' ';
  });
  // "Cheap" is only safe to discard when the shopper supplied an actual
  // price ceiling. Without a number it remains honest lexical input until a
  // price-sort intent exists end to end.
  if (priceMax !== null) text = text.replace(/\bcheap(?:est)?\b/g, ' ');

  const colours = [];
  for (const [phrase, canonical] of [...COLOURS].sort((a, b) => b[0].length - a[0].length)) {
    const padded = ` ${text} `;
    if (!new RegExp(`(?:^|\\s)${escaped(phrase)}(?=\\s|$)`).test(padded)) continue;
    colours.push(canonical);
    text = removePhrase(text, phrase);
  }

  const sizes = [];
  for (const [phrase, canonical] of [...SIZES].sort((a, b) => b[0].length - a[0].length)) {
    const padded = ` ${text} `;
    if (!new RegExp(`(?:^|\\s)${escaped(phrase)}(?=\\s|$)`).test(padded)) continue;
    sizes.push(canonical);
    text = removePhrase(text, phrase);
  }

  // A colour- or size-only query is still useful lexical retrieval. Keeping
  // the word also lets the stored candidate index narrow the catalogue before
  // the structured constraint is applied to the returned product records.
  if (!normalize(text) && priceMax === null && !inStock && !measurements.length) {
    text = normalize(raw);
  }

  return {
    text: normalize(text),
    priceMax: Number.isFinite(priceMax) ? priceMax : null,
    inStock,
    colours: [...new Set(colours)],
    sizes: [...new Set(sizes)],
    measurements: [...new Set(measurements)],
  };
}

export function productMatchesSearchIntent(product, intent) {
  if (!intent) return true;
  if (intent.priceMax !== null) {
    const price = productPrice(product);
    // A price promise must fail closed when no trustworthy price is present.
    if (price === null || price > intent.priceMax) return false;
  }
  if (intent.inStock && !productHasStock(product)) return false;

  const text = normalizedProductText(product);
  const productMeasurements = new Set(extractMeasurements(productRawText(product)).measurements);
  if (intent.measurements?.some((measurement) => !productMeasurements.has(measurement))) return false;
  if (intent.colours?.length && !intent.colours.some((colour) => {
    if (colour === 'grey') return /\bgr(?:e|a)y\b/.test(text);
    if (colour === 'multicolour') return /\bmulti\s*colou?r\b/.test(text);
    return new RegExp(`(?:^|\\s)${escaped(colour)}(?=\\s|$)`).test(` ${text} `);
  })) return false;
  if (intent.sizes?.length && !intent.sizes.some((size) => {
    const aliases = [...SIZES].filter(([, canonical]) => canonical === size).map(([phrase]) => phrase);
    return aliases.some((phrase) => new RegExp(`(?:^|\\s)${escaped(phrase)}(?=\\s|$)`).test(` ${text} `));
  })) return false;
  return true;
}

export function searchQueryHasStructuredIntent(value) {
  const intent = typeof value === 'string' ? parseSearchQuery(value) : value;
  return Boolean(intent && (
    intent.priceMax !== null || intent.inStock || intent.colours?.length
    || intent.sizes?.length || intent.measurements?.length
  ));
}

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacePhrase(value, from, to) {
  return value.replace(new RegExp(`(?:^|\\s)${escaped(from)}(?=\\s|$)`, 'g'), (match) => {
    const leadingSpace = match.startsWith(' ') ? ' ' : '';
    return `${leadingSpace}${to}`;
  }).replace(/\s+/g, ' ').trim();
}

export function searchQueryVariants(value, limit = 12) {
  const intent = parseSearchQuery(value);
  const query = intent.text;
  if (!query) return [];
  const variants = [query];
  for (const [canonical, aliases] of SEARCH_FAMILIES) {
    const family = [canonical, ...aliases].map(normalize).sort((a, b) => b.length - a.length);
    const matched = family.find((phrase) => new RegExp(`(?:^|\\s)${escaped(phrase)}(?:\\s|$)`).test(` ${query} `));
    if (!matched) continue;
    // Once a shopper adds a concrete colour, size or measurement, a specific
    // family word such as "teddy" is an object request, not permission to
    // return every blue soft toy. Canonical category wording remains broad.
    const hasConcreteConstraint = intent.colours.length || intent.sizes.length || intent.measurements.length;
    if (hasConcreteConstraint && matched !== canonical && matched !== `${canonical}s`) break;
    for (const phrase of family) variants.push(replacePhrase(query, matched, phrase));
    // One customer phrase should expand within its own product family. Avoid
    // a combinatorial cross-product if a query happens to mention two ranges.
    break;
  }
  return [...new Set(variants)].slice(0, Math.max(1, limit));
}

export function searchQueryUsesFamily(value, canonical) {
  const query = parseSearchQuery(value).text;
  const family = SEARCH_FAMILIES.find(([name]) => name === canonical);
  if (!family) return false;
  return [family[0], ...family[1]].map(normalize)
    .some((phrase) => new RegExp(`(?:^|\\s)${escaped(phrase)}(?=\\s|$)`).test(` ${query} `));
}

export function firstRelatedSearchTerm(value) {
  const variants = searchQueryVariants(value);
  return variants.find((variant) => variant !== normalize(value)) || null;
}
