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

function scoreProduct(product, queryTokens) {
  const rawText = productSearchText(product);
  const text = normalize(rawText);
  const textCompact = compact(rawText);
  const code = normalize(product.code);
  const codeCompact = compact(product.code);
  let score = 0;
  let matched = false;

  for (const token of queryTokens) {
    const tokenCompact = compact(token);
    if (!tokenCompact) continue;

    if (code === token || codeCompact === tokenCompact) {
      score += 220;
      matched = true;
      continue;
    }
    if (code.startsWith(token) || codeCompact.startsWith(tokenCompact)) {
      score += 180;
      matched = true;
      continue;
    }
    if (text.includes(token) || textCompact.includes(tokenCompact)) {
      score += 95;
      matched = true;
      continue;
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
