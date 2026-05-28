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

function productSearchText(product) {
  return [
    product.code,
    product.name,
    product.colour,
    product.size,
    product.style,
    product.casePack,
    product.marginCue,
    ...(product.badges || []),
    ...(product.tags || []).map((t) => (typeof t === 'string' ? t : t.label || '')),
  ]
    .filter(Boolean)
    .join(' ');
}

// Levenshtein edit distance — for typo tolerance on individual tokens
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

// Max allowed edit distance for a given token length
function maxEdits(tokenLen) {
  if (tokenLen <= 3) return 0;  // short tokens must match exactly
  if (tokenLen <= 5) return 1;  // 1 edit for medium tokens
  return 2;                      // 2 edits for longer tokens
}

function scoreProduct(product, queryTokens) {
  const rawText = productSearchText(product);
  const text = normalize(rawText);
  const textCompact = compact(rawText);
  const textWords = text.split(/\s+/).filter(Boolean);
  const code = normalize(product.code);
  const codeCompact = compact(product.code);
  let score = 0;
  let matched = false;

  for (const token of queryTokens) {
    const tokenCompact = compact(token);
    if (!tokenCompact) continue;

    if (code === token || codeCompact === tokenCompact) {
      score += 220; matched = true; continue;
    }
    if (code.startsWith(token) || codeCompact.startsWith(tokenCompact)) {
      score += 180; matched = true; continue;
    }
    if (text.includes(token) || textCompact.includes(tokenCompact)) {
      score += 95; matched = true; continue;
    }

    // Fuzzy / typo tolerance — compare token against each word in product text
    const allowed = maxEdits(token.length);
    if (allowed > 0) {
      let bestDist = Infinity;
      for (const word of textWords) {
        if (Math.abs(word.length - token.length) > allowed) continue;
        const d = editDistance(token, word);
        if (d < bestDist) bestDist = d;
      }
      if (bestDist <= allowed) {
        score += bestDist === 1 ? 55 : 30;
        matched = true;
        continue;
      }
    }
  }

  return matched ? score : 0;
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

// Top N suggestions for typeahead dropdown
export function getSuggestions(products, query, limit = 8) {
  if (!query || !query.trim()) return [];
  return fuzzyFilter(products, query).slice(0, limit);
}
