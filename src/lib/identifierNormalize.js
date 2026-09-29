/** Canonical form for SKU/barcode identifier matching (not text search). */
export function normalizeIdentifier(value) {
  return String(value || '')
    .replace(/^(?:sku|item\s*code|product\s*code|code|barcode)\s*[:#-]?\s*/i, '')
    .toUpperCase()
    .replace(/[\s_./-]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * True when the query should use identifier lookup instead of text search.
 * Requires digits; rejects natural-language multi-word queries (e.g. "gift bag").
 */
export function isIdentifierQuery(query) {
  const raw = String(query || '').trim();
  if (!raw || !/\d/.test(raw)) return false;

  const labelled = /^(?:sku|item\s*code|product\s*code|code|barcode)\s*[:#-]?\s*(.+)$/i.exec(raw);
  const candidate = labelled ? labelled[1].trim() : raw;

  // Measurements, page sizes and prices are customer language even though
  // they combine letters and digits. They must continue through normal text
  // and structured-intent search instead of the exact-code path.
  if (/^(?:r|zar)\s*\d/i.test(candidate)) return false;
  if (/^\d+(?:[.,]\d+)?\s*(?:mm|cm|m|ml|l|g|kg)$/i.test(candidate)) return false;
  if (/^[a-z]\d+\s+\S/i.test(candidate)) return false;

  const id = normalizeIdentifier(candidate);
  if (id.length < 4 || !/^[A-Z0-9]+$/.test(id)) return false;

  if (labelled) return /^[A-Z0-9_./-]+$/i.test(candidate);

  // A split numeric barcode is still an identifier. Other multi-word input
  // is ordinary language (for example "pack of 12"), never a code lookup.
  if (/^\d[\d\s]+$/.test(candidate)) return true;
  if (/\s/.test(candidate)) return false;

  return /^[A-Z0-9_./-]+$/i.test(candidate);
}

/** Pure-numeric base + one or more trailing letters only (not extra digits). */
export function isAlphabeticSuffixVariant(productIdNorm, baseQueryNorm) {
  if (!/^\d+$/.test(baseQueryNorm)) return false;
  if (productIdNorm === baseQueryNorm) return false;
  const escaped = baseQueryNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}[A-Z]+$`).test(productIdNorm);
}
