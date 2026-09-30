const INSTORE_PATHS = new Set(['instore-products', 'extended-range']);

/** Return the committed main-catalogue query represented by a storefront route. */
export function catalogueSearchQueryFromRoute(path = [], refinements = {}) {
  if (INSTORE_PATHS.has(path[0])) return '';
  return String(refinements?.q || '').trim();
}

/** Build a shareable main-catalogue search route. */
export function catalogueSearchRoute(query) {
  const q = String(query || '').trim();
  return { path: [], refinements: q ? { q } : {} };
}
