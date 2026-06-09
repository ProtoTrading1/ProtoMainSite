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

function stem(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ves') && word.length > 4) return word.slice(0, -3) + 'f';
  if (/(?:ss|sh|ch|x)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('ses') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('ing') && word.length > 5) {
    const root = word.slice(0, -3);
    if (root.length >= 2 && root[root.length - 1] === root[root.length - 2]) return root.slice(0, -1);
    return root;
  }
  if (word.endsWith('ed') && word.length > 4) {
    const root = word.slice(0, -2);
    if (root.length >= 2 && root[root.length - 1] === root[root.length - 2]) return root.slice(0, -1);
    return root;
  }
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
}

function compact(value) {
  return normalize(value).replace(/\s+/g, '');
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

  const rawText = productSearchText(product);
  const text = normalize(rawText);
  const textCompact = compact(rawText);
  const textWords = text.split(/\s+/).filter(Boolean);
  const stemmedWords = textWords.map(stem);
  const code = normalize(product.code);
  const codeCompact = compact(product.code);
  const name = normalize(product.name);
  const nameCompact = compact(product.name);

  const index = {
    rawText,
    text,
    textCompact,
    textWords,
    stemmedWords,
    code,
    codeCompact,
    name,
    nameCompact,
  };
  searchIndex.set(product, index);
  return index;
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

function maxEdits(tokenLen) {
  if (tokenLen <= 3) return 0;
  if (tokenLen <= 5) return 1;
  return 2;
}

function scoreToken(index, token) {
  const tokenCompact = compact(token);
  if (!tokenCompact) return 0;
  const tokenStem = stem(token);
  const {
    text, textCompact, textWords, stemmedWords, code, codeCompact, name, nameCompact,
  } = index;

  if (code === token || codeCompact === tokenCompact) return 220;
  if (code.startsWith(token) || codeCompact.startsWith(tokenCompact)) return 180;
  if (name === token || nameCompact === tokenCompact) return 170;
  if (name.startsWith(token) || nameCompact.startsWith(tokenCompact)) return 150;
  if (text.includes(token) || textCompact.includes(tokenCompact)) return 95;

  if (tokenStem !== token && stemmedWords.includes(tokenStem)) return 80;
  if (tokenStem.length >= 4 && stemmedWords.some((w) => w.startsWith(tokenStem) || tokenStem.startsWith(w))) {
    return 65;
  }

  const allowed = maxEdits(token.length);
  if (allowed > 0) {
    let bestDist = Infinity;
    for (let i = 0; i < textWords.length; i++) {
      const word = textWords[i];
      const sWord = stemmedWords[i];
      if (Math.abs(word.length - token.length) <= allowed + 1) {
        const d = editDistance(token, word);
        if (d < bestDist) bestDist = d;
      }
      if (tokenStem !== token && Math.abs(sWord.length - tokenStem.length) <= allowed + 1) {
        const d = editDistance(tokenStem, sWord);
        if (d < bestDist) bestDist = d;
      }
    }
    if (bestDist <= allowed) return bestDist === 1 ? 55 : 30;
    if (bestDist <= allowed + 1 && tokenStem !== token) return 20;
  }

  return 0;
}

function scoreProduct(product, queryTokens) {
  const index = getSearchIndex(product);
  let score = 0;
  let matchedCount = 0;

  for (const token of queryTokens) {
    const tokenScore = scoreToken(index, token);
    if (tokenScore > 0) {
      score += tokenScore;
      matchedCount += 1;
    }
  }

  // Forgiving matching: at least one word needs to hit. Extra matching words
  // raise the score so "aa battery" ranks AA batteries above unrelated "aa" lines.
  if (matchedCount === 0) return 0;

  const significantTokens = queryTokens.filter((token) => token.length >= 2);
  if (significantTokens.length > 0) {
    const significantHits = significantTokens.filter((token) => scoreToken(index, token) > 0).length;
    if (significantHits === 0) return 0;
  }

  if (matchedCount === queryTokens.length && queryTokens.length > 1) {
    score += 50;
  }

  const phrase = queryTokens.join(' ');
  if (phrase.length >= 4 && (index.name.includes(phrase) || index.text.includes(phrase))) {
    score += 40;
  }

  return score;
}

export function fuzzyFilter(products, query) {
  const q = normalize(query);
  if (!q) return products;
  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = products
    .map((product) => ({ product, score: scoreProduct(product, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((item) => item.product);
}

export function getSuggestions(products, query, limit = 8) {
  if (!query || !query.trim()) return [];
  return fuzzyFilter(products, query).slice(0, limit);
}
