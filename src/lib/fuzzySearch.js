export const SEARCH_MIN_CONFIDENCE = 50;

import {
  isAlphabeticSuffixVariant,
  isIdentifierQuery,
  normalizeIdentifier,
} from './identifierNormalize.js';

const SCORE = {
  EXACT_SKU: 100,
  EXACT_BARCODE: 99,
  SKU_VARIANT: 98,
  EXACT_NAME: 95,
  HEAD_NOUN_NAME: 92,
  NAME_PREFIX: 90,
  WHOLE_WORD_NAME: 85,
  MODIFIER_NAME: 80,
  DESCRIPTION: 70,
  KEYWORD: 60,
  TYPO: 50,
};

const searchIndex = new WeakMap();
const suggestionCache = new WeakMap();
const datasetIndex = new WeakMap();

// Proto-specific language customers commonly use. The canonical term is added
// to the query; the original words remain, so this expands rather than replaces
// what the customer typed.
const SEARCH_SYNONYMS = new Map([
  ['purse', ['wallet', 'handbag']],
  ['purses', ['wallet', 'handbag']],
  ['teddy', ['soft toy']],
  ['teddies', ['soft toy']],
  ['stationary', ['stationery']],
  ['earring back', ['butterfly']],
  ['earring backs', ['butterfly']],
  ['gift bag', ['paper bag', 'carrier bag']],
  ['gift bags', ['paper bag', 'carrier bag']],
  ['cellphone', ['mobile phone']],
  ['cell phone', ['mobile phone']],
  ['colouring', ['coloring']],
  ['jewellery', ['jewelry']],
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

function compact(value) {
  return normalize(value).replace(/\s+/g, '');
}

function queryVariants(value) {
  const normalized = normalize(value);
  if (!normalized) return [];
  const variants = [normalized];
  for (const [phrase, synonyms] of SEARCH_SYNONYMS) {
    if (!normalized.includes(phrase)) continue;
    for (const synonym of synonyms) {
      variants.push(normalized.replace(phrase, synonym));
    }
  }
  return [...new Set(variants)];
}

export function getRelatedSearchTerm(value) {
  const normalized = normalize(value);
  if (!normalized) return null;
  for (const [phrase, synonyms] of SEARCH_SYNONYMS) {
    if (normalized.includes(phrase)) return synonyms[0] || null;
  }
  return null;
}

function words(text) {
  return normalize(text).split(/\s+/).filter(Boolean);
}

function wholeWordIn(text, token) {
  if (!token) return false;
  return words(text).includes(token);
}

/** Title segment before | or dash; trim at "with/for/…" trailing phrases. */
function primaryNameWords(name) {
  const segment = String(name || '').split(/\||\u2013|\u2014|–/)[0];
  let ws = words(segment);
  const tail = ws.findIndex((w) => ['with', 'for', 'and', 'in', 'of'].includes(w));
  if (tail > 0) ws = ws.slice(0, tail);
  return ws;
}

function phraseHead(name) {
  const ws = primaryNameWords(name);
  return ws.length ? ws[ws.length - 1] : null;
}

/** Leading word in a two-word compound (e.g. "Bag Strap", "Pen Case") — not the product type. */
function isLeadingCompoundModifier(name, token) {
  const ws = primaryNameWords(name);
  return ws.length === 2 && ws[0] === token && ws[1] !== token;
}

function editDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

/** Adjacent transposition counts as one edit (scraf → scarf). */
function typoDistance(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return editDistance(a, b);
  const d = editDistance(a, b);
  if (d <= 1) return d;
  if (a.length >= 2 && b.length >= 2) {
    for (let i = 0; i < a.length - 1; i++) {
      const swapped = a.slice(0, i) + a[i + 1] + a[i] + a.slice(i + 2);
      if (swapped === b) return 1;
    }
  }
  return d;
}

function skuValues(product) {
  return [product.code, product.websiteSku, product.sku, product.parentSku]
    .filter(Boolean)
    .map((v) => String(v));
}

function barcodeValues(product) {
  return [product.barcode, product.code]
    .filter(Boolean)
    .map((v) => String(v));
}

function productSearchText(product) {
  const pathLabels = (product.categoryPath || []).join(' ');
  return [
    product.code,
    product.websiteSku,
    product.parentSku,
    product.barcode,
    product.name,
    product.description,
    product.colour,
    product.size,
    product.style,
    product.casePack,
    product.marginCue,
    product.supplier,
    pathLabels,
    ...(product.badges || []),
    ...(product.tags || []).map((t) => (typeof t === 'string' ? t : t.label || '')),
  ]
    .filter(Boolean)
    .join(' ');
}

function getSearchIndex(product) {
  const cached = searchIndex.get(product);
  if (cached) return cached;

  const name = normalize(product.name);
  const nameCompact = compact(product.name);
  const nameWords = words(product.name);
  const description = normalize(product.description || product.originalDescription || '');
  const descWords = words(product.description || product.originalDescription || '');
  const keywordText = normalize([
    product.colour,
    product.size,
    product.style,
    product.casePack,
    product.marginCue,
    product.supplier,
    (product.categoryPath || []).join(' '),
    ...(product.badges || []),
    ...(product.tags || []).map((t) => (typeof t === 'string' ? t : t.label || '')),
  ].filter(Boolean).join(' '));

  const skus = skuValues(product).map((v) => ({
    norm: normalize(v),
    compact: compact(v),
    idNorm: normalizeIdentifier(v),
  }));
  const barcodes = barcodeValues(product).map((v) => ({
    norm: normalize(v),
    compact: compact(v),
    idNorm: normalizeIdentifier(v),
  }));

  const index = {
    name,
    nameCompact,
    nameWords,
    phraseWords: primaryNameWords(product.name),
    phraseHead: phraseHead(product.name),
    description,
    descWords,
    keywordText,
    skus,
    barcodes,
    rawText: productSearchText(product),
  };
  searchIndex.set(product, index);
  return index;
}

export function prepareSearchIndex(products) {
  if (!Array.isArray(products) || datasetIndex.has(products)) return;
  const tokenMap = new Map();
  const add = (token, product) => {
    if (!token) return;
    let matches = tokenMap.get(token);
    if (!matches) {
      matches = new Set();
      tokenMap.set(token, matches);
    }
    matches.add(product);
  };

  for (const product of products) {
    const index = getSearchIndex(product);
    const tokens = new Set([
      ...index.nameWords,
      ...index.descWords,
      ...words(index.keywordText),
      index.nameCompact,
      ...index.skus.flatMap((value) => [value.norm, value.compact, value.idNorm]),
      ...index.barcodes.flatMap((value) => [value.norm, value.compact, value.idNorm]),
    ]);
    for (const token of tokens) add(token, product);
  }
  datasetIndex.set(products, { tokenMap, vocabulary: [...tokenMap.keys()] });
}

function intersectSets(left, right) {
  if (!left) return new Set(right);
  const result = new Set();
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of small) {
    if (large.has(value)) result.add(value);
  }
  return result;
}

function candidateProducts(products, query) {
  prepareSearchIndex(products);
  const prepared = datasetIndex.get(products);
  if (!prepared) return products;
  if (isIdentifierQuery(query)) return products;

  const tokens = normalize(query).split(/\s+/).filter((token) => token.length >= 2);
  if (tokens.length === 0) return products;

  let candidates = null;
  for (const token of tokens) {
    let tokenMatches = prepared.tokenMap.get(token);
    if (!tokenMatches) {
      tokenMatches = new Set();
      for (const word of prepared.vocabulary) {
        const prefixMatch = word.startsWith(token) || token.startsWith(word);
        const typoMatch = token.length >= 4
          && word.length >= 4
          && /^[a-z]+$/.test(token)
          && /^[a-z]+$/.test(word)
          && Math.abs(token.length - word.length) <= 1
          && typoDistance(token, word) === 1;
        if (!prefixMatch && !typoMatch) continue;
        for (const product of prepared.tokenMap.get(word)) tokenMatches.add(product);
      }
    }
    candidates = intersectSets(candidates, tokenMatches);
    if (candidates.size === 0) break;
  }
  return candidates ? [...candidates] : products;
}

function isAvailable(product) {
  const raw = product?.stockOnHand ?? product?.stockQty ?? product?.available_stock ?? product?.stock_qty;
  if (raw !== undefined && raw !== null && raw !== '') {
    const qty = Number(raw);
    if (Number.isFinite(qty) && qty !== 0) return true;
    return product?.toOrder === true
      || product?.to_order === true
      || product?.orderableWhenOutOfStock === true
      || product?.orderable_when_out_of_stock === true;
  }
  return product?.inStock !== false;
}

function scoreExactSku(index, token, tokenCompact) {
  for (const sku of index.skus) {
    if (sku.norm === token || sku.compact === tokenCompact) return SCORE.EXACT_SKU;
  }
  return 0;
}

function scoreExactBarcode(index, token, tokenCompact) {
  for (const bc of index.barcodes) {
    if (bc.norm === token || bc.compact === tokenCompact) return SCORE.EXACT_BARCODE;
  }
  return 0;
}

function scoreNameMatch(index, token, tokenCompact) {
  if (index.name === token || index.nameCompact === tokenCompact) return SCORE.EXACT_NAME;

  const isWholeWord = wholeWordIn(index.name, token);
  if (index.phraseHead === token && isWholeWord) return SCORE.HEAD_NOUN_NAME;
  if (isLeadingCompoundModifier(index.name, token)) return SCORE.MODIFIER_NAME;

  if (index.name.startsWith(token) || index.nameCompact.startsWith(tokenCompact)) {
    // Multi-word names starting with the token are modifier compounds, not true prefixes.
    if (index.phraseWords.length > 1 && index.phraseWords[0] === token) {
      return isWholeWord ? SCORE.WHOLE_WORD_NAME : SCORE.MODIFIER_NAME;
    }
    return SCORE.NAME_PREFIX;
  }

  if (isWholeWord) return SCORE.WHOLE_WORD_NAME;
  return 0;
}

function scoreDescriptionMatch(index, token) {
  if (wholeWordIn(index.description, token)) return SCORE.DESCRIPTION;
  return 0;
}

function scoreKeywordMatch(index, token) {
  if (wholeWordIn(index.keywordText, token)) return SCORE.KEYWORD;
  return 0;
}

function scoreTypoOnName(index, token) {
  if (token.length < 4) return 0;
  for (const word of index.nameWords) {
    if (word.length >= 4 && typoDistance(token, word) === 1) return SCORE.TYPO;
  }
  return 0;
}

function scoreToken(index, token) {
  const t = normalize(token);
  const tCompact = compact(token);
  if (!t) return 0;

  return (
    scoreExactSku(index, t, tCompact)
    || scoreExactBarcode(index, t, tCompact)
    || scoreNameMatch(index, t, tCompact)
    || scoreDescriptionMatch(index, t)
    || scoreKeywordMatch(index, t)
    || scoreTypoOnName(index, t)
  );
}

function scoreIdentifierQuery(product, query) {
  const queryId = normalizeIdentifier(query);
  if (!queryId) return 0;

  const index = getSearchIndex(product);
  let score = 0;

  for (const sku of index.skus) {
    if (sku.idNorm === queryId) return SCORE.EXACT_SKU;
  }

  for (const bc of index.barcodes) {
    if (bc.idNorm === queryId) score = Math.max(score, SCORE.EXACT_BARCODE);
  }
  if (score > 0) return score;

  if (/^\d+$/.test(queryId)) {
    for (const sku of index.skus) {
      if (isAlphabeticSuffixVariant(sku.idNorm, queryId)) {
        score = Math.max(score, SCORE.SKU_VARIANT);
      }
    }
    for (const bc of index.barcodes) {
      if (isAlphabeticSuffixVariant(bc.idNorm, queryId)) {
        score = Math.max(score, SCORE.SKU_VARIANT);
      }
    }
  }

  return score;
}

function scoreProduct(product, query) {
  const q = normalize(query);
  if (!q) return 0;

  if (isIdentifierQuery(query)) {
    return scoreIdentifierQuery(product, query);
  }

  const tokens = q.split(/\s+/).filter(Boolean);
  const significant = tokens.filter((t) => t.length >= 2);
  if (significant.length === 0) return 0;

  const index = getSearchIndex(product);
  let total = 0;

  for (const token of significant) {
    const tokenScore = scoreToken(index, token);
    if (tokenScore < SEARCH_MIN_CONFIDENCE) return 0;
    total += tokenScore;
  }

  const phrase = significant.join(' ');
  if (phrase.length >= 4 && (index.name.includes(phrase) || index.description.includes(phrase))) {
    total += 10;
  }

  return total;
}

export function fuzzyFilter(products, query) {
  const variants = queryVariants(query);
  if (variants.length === 0) return products;

  const candidateSet = new Set();
  for (const variant of variants) {
    for (const product of candidateProducts(products, variant)) candidateSet.add(product);
  }

  const scored = [...candidateSet]
    .map((product) => ({
      product,
      score: Math.max(...variants.map((variant) => scoreProduct(product, variant))),
    }))
    .filter((item) => item.score >= SEARCH_MIN_CONFIDENCE)
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) return scoreDelta;
      return Number(isAvailable(b.product)) - Number(isAvailable(a.product));
    });

  return scored.map((item) => item.product);
}

export function getSuggestions(products, query, limit = 8) {
  if (!query || !query.trim()) return [];
  let cache = suggestionCache.get(products);
  if (!cache) {
    cache = new Map();
    suggestionCache.set(products, cache);
  }
  const key = `${normalize(query)}::${limit}`;
  if (cache.has(key)) return cache.get(key);
  const result = fuzzyFilter(products, query).slice(0, limit);
  cache.set(key, result);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return result;
}
