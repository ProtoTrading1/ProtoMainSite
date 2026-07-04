export const SEARCH_MIN_CONFIDENCE = 50;

const SCORE = {
  EXACT_SKU: 100,
  EXACT_BARCODE: 99,
  EXACT_NAME: 95,
  NAME_PREFIX: 90,
  WHOLE_WORD_NAME: 85,
  DESCRIPTION: 70,
  KEYWORD: 60,
  TYPO: 50,
};

const searchIndex = new WeakMap();

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

function words(text) {
  return normalize(text).split(/\s+/).filter(Boolean);
}

function wholeWordIn(text, token) {
  if (!token) return false;
  return words(text).includes(token);
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

function isSkuLikeQuery(query) {
  const raw = String(query || '').trim();
  if (!raw || /\s/.test(raw)) return false;
  return /^[a-z0-9-]+$/i.test(raw) && (/\d/.test(raw) || raw.length >= 6);
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

  const skus = skuValues(product).map((v) => ({ norm: normalize(v), compact: compact(v) }));
  const barcodes = barcodeValues(product).map((v) => ({ norm: normalize(v), compact: compact(v) }));

  const index = {
    name,
    nameCompact,
    nameWords,
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
  if (index.name.startsWith(token) || index.nameCompact.startsWith(tokenCompact)) return SCORE.NAME_PREFIX;
  if (wholeWordIn(index.name, token)) return SCORE.WHOLE_WORD_NAME;
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

function scoreSkuLikeQuery(product, query) {
  const token = normalize(query);
  const tokenCompact = compact(query);
  if (!token) return 0;
  const index = getSearchIndex(product);
  return scoreExactSku(index, token, tokenCompact)
    || scoreExactBarcode(index, token, tokenCompact);
}

function scoreProduct(product, query) {
  const q = normalize(query);
  if (!q) return 0;

  if (isSkuLikeQuery(query)) {
    return scoreSkuLikeQuery(product, query);
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
  const q = normalize(query);
  if (!q) return products;

  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, query) }))
    .filter((item) => item.score >= SEARCH_MIN_CONFIDENCE)
    .sort((a, b) => b.score - a.score);

  return scored.map((item) => item.product);
}

export function getSuggestions(products, query, limit = 8) {
  if (!query || !query.trim()) return [];
  return fuzzyFilter(products, query).slice(0, limit);
}
