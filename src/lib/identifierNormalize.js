/** Canonical form for SKU/barcode identifier matching (not text search). */
export function normalizeIdentifier(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[\s\-_\/.]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * True when the query should use identifier lookup instead of text search.
 * Requires digits; rejects natural-language multi-word queries (e.g. "gift bag").
 */
export function isIdentifierQuery(query) {
  const raw = String(query || '').trim();
  if (!raw || !/\d/.test(raw)) return false;

  const id = normalizeIdentifier(raw);
  if (id.length < 4 || !/^[A-Z0-9]+$/.test(id)) return false;

  const parts = raw.split(/\s+/);
  if (parts.length === 1) return true;

  if (!parts.some((part) => /\d/.test(part))) return false;

  for (const part of parts) {
    if (!/^[\w\-_\/.]+$/i.test(part)) return false;
    const stripped = part.replace(/[\-_/\.]/g, '');
    if (!/\d/.test(part)) {
      if (!/^[a-z]+$/i.test(stripped) || stripped.length > 4) return false;
    }
  }

  return true;
}

/** Pure-numeric base + one or more trailing letters only (not extra digits). */
export function isAlphabeticSuffixVariant(productIdNorm, baseQueryNorm) {
  if (!/^\d+$/.test(baseQueryNorm)) return false;
  if (productIdNorm === baseQueryNorm) return false;
  const escaped = baseQueryNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}[A-Z]+$`).test(productIdNorm);
}
