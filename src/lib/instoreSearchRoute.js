const INSTORE_PATH = ['instore-products'];
const INSTORE_QUERY_KEY = 'q';
const INSTORE_PAGE_KEY = 'page';

export function normalizeInstoreSearchQuery(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function instoreSearchQueryFromRefinements(refinements = {}) {
  return normalizeInstoreSearchQuery(refinements[INSTORE_QUERY_KEY]);
}

export function instorePageFromRefinements(refinements = {}) {
  const value = Number.parseInt(String(refinements[INSTORE_PAGE_KEY] || ''), 10);
  return Number.isSafeInteger(value) && value > 1 ? value : 1;
}

export function instoreSearchRefinements(refinements = {}, query = '') {
  const next = { ...refinements };
  const normalized = normalizeInstoreSearchQuery(query);
  delete next.browse;
  delete next[INSTORE_PAGE_KEY];
  if (normalized) next[INSTORE_QUERY_KEY] = normalized;
  else delete next[INSTORE_QUERY_KEY];
  return next;
}

export function instorePageRefinements(refinements = {}, page = 1) {
  const next = { ...refinements };
  const normalized = Number.parseInt(String(page), 10);
  if (Number.isSafeInteger(normalized) && normalized > 1) next[INSTORE_PAGE_KEY] = String(normalized);
  else delete next[INSTORE_PAGE_KEY];
  return next;
}

export function instoreSearchRoute(query) {
  return {
    path: [...INSTORE_PATH],
    refinements: instoreSearchRefinements({}, query),
  };
}
