function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lightweight stemmer — normalises common English morphological endings so that
// "batteries" and "battery" both reduce to "batter", etc.
function stem(word) {
  if (word.length <= 3) return word;
  // ies → y  (batteries → battery, flies → fly)
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  // ves → f  (knives → knife)
  if (word.endsWith('ves') && word.length > 4) return word.slice(0, -3) + 'f';
  // sses / shes / ches / xes → strip es
  if (/(?:ss|sh|ch|x)es$/.test(word)) return word.slice(0, -2);
  // ses → s  (passes → pass)
  if (word.endsWith('ses') && word.length > 4) return word.slice(0, -2);
  // ing → (strip, but keep root if it would be < 3 chars)
  if (word.endsWith('ing') && word.length > 5) {
    const root = word.slice(0, -3);
    // double consonant before -ing: running → run
    if (root.length >= 2 && root[root.length - 1] === root[root.length - 2]) return root.slice(0, -1);
    return root;
  }
  // ed → strip
  if (word.endsWith('ed') && word.length > 4) {
    const root = word.slice(0, -2);
    if (root.length >= 2 && root[root.length - 1] === root[root.length - 2]) return root.slice(0, -1);
    return root;
  }
  // plain plural s (not ss)
  if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);
  return word;
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
  const stemmedWords = textWords.map(stem);
  const code = normalize(product.code);
  const codeCompact = compact(product.code);
  let score = 0;
  let matched = false;

  for (const token of queryTokens) {
    const tokenCompact = compact(token);
    if (!tokenCompact) continue;
    const tokenStem = stem(token);

    if (code === token || codeCompact === tokenCompact) {
      score += 220; matched = true; continue;
    }
    if (code.startsWith(token) || codeCompact.startsWith(tokenCompact)) {
      score += 180; matched = true; continue;
    }
    if (text.includes(token) || textCompact.includes(tokenCompact)) {
      score += 95; matched = true; continue;
    }

    // Stem match — "batteries" stem "batter" matches "battery" stem "batter"
    if (tokenStem !== token && stemmedWords.includes(tokenStem)) {
      score += 80; matched = true; continue;
    }
    // Stem prefix — "batter" starts with "batter"
    if (tokenStem.length >= 4 && stemmedWords.some((w) => w.startsWith(tokenStem) || tokenStem.startsWith(w))) {
      score += 65; matched = true; continue;
    }

    // Fuzzy / typo tolerance — compare token against each word in product text
    // Also try stemmed form of token vs stemmed words for plurals + typos
    const allowed = maxEdits(token.length);
    if (allowed > 0) {
      let bestDist = Infinity;
      for (let i = 0; i < textWords.length; i++) {
        const word = textWords[i];
        const sWord = stemmedWords[i];
        // compare raw token vs raw word
        if (Math.abs(word.length - token.length) <= allowed + 1) {
          const d = editDistance(token, word);
          if (d < bestDist) bestDist = d;
        }
        // compare stemmed token vs stemmed word (catches plurals + 1 typo)
        if (tokenStem !== token && Math.abs(sWord.length - tokenStem.length) <= allowed + 1) {
          const d = editDistance(tokenStem, sWord);
          if (d < bestDist) bestDist = d;
        }
      }
      if (bestDist <= allowed) {
        score += bestDist === 1 ? 55 : 30;
        matched = true;
        continue;
      }
      // Slightly looser: one extra allowed edit for stem comparisons
      if (bestDist <= allowed + 1 && tokenStem !== token) {
        score += 20;
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
