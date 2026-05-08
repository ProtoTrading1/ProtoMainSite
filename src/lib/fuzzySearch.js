function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
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
  ].filter(Boolean).join(' ').toLowerCase();
}

function scoreProduct(product, queryTokens) {
  const text = productSearchText(product);
  const code = (product.code || '').toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    // Exact code match → very high
    if (code === token) { score += 200; continue; }
    // Code starts with token
    if (code.startsWith(token)) { score += 120; continue; }
    // Text contains token exactly
    if (text.includes(token)) { score += 80; continue; }
    // Fuzzy: check each word in text
    const words = text.split(/\s+/);
    let bestDist = Infinity;
    for (const word of words) {
      if (Math.abs(word.length - token.length) > 3) continue;
      const dist = levenshtein(token, word);
      if (dist < bestDist) bestDist = dist;
    }
    if (token.length >= 4 && bestDist <= 1) { score += 40; continue; }
    if (token.length >= 5 && bestDist <= 2) { score += 20; continue; }
  }

  return score;
}

export function fuzzyFilter(products, query) {
  const q = query.trim().toLowerCase();
  if (!q) return products;
  const tokens = q.split(/\s+/).filter((t) => t.length > 0);
  const scored = products
    .map((p) => ({ product: p, score: scoreProduct(p, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.product);
}
