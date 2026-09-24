import { authenticatedGetJson } from './authHeaders';
import {
  RESPONSE_CACHE_TTL_MS, STORAGE_KEY_PREFIX, STORED_RESPONSE_LIMIT,
  STORED_RESPONSE_MAX_BYTES, instoreRequestKey, storedResponseIsUsable,
} from '../../lib/instore-response-cache.mjs';

const responseCache = new Map();
let catalogueRequest = null;
let catalogueProducts = null;

function storage() {
  try {
    return window.sessionStorage;
  } catch {
    // Private windows and blocked site data must not break browsing.
    return null;
  }
}

// Per tab, and dropped when the tab closes. Instore prices and stock are the
// same for every approved customer, but the store is still cleared on sign-out
// so nothing of one session is left for the next.
export function clearStoredInstoreResponses() {
  responseCache.clear();
  catalogueRequest = null;
  catalogueProducts = null;
  const store = storage();
  if (!store) return;
  try {
    for (const key of Object.keys(store)) {
      if (key.startsWith(STORAGE_KEY_PREFIX)) store.removeItem(key);
    }
  } catch { /* nothing stored is worth failing for */ }
}

function readStored(key) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(`${STORAGE_KEY_PREFIX}${key}`);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return storedResponseIsUsable(entry) ? entry.data : null;
  } catch {
    return null;
  }
}

function writeStored(key, data) {
  const store = storage();
  if (!store || !Array.isArray(data?.products)) return;
  try {
    const raw = JSON.stringify({ storedAt: Date.now(), data });
    if (raw.length > STORED_RESPONSE_MAX_BYTES) return;
    // Keep the store small: a handful of recently seen views, not a mirror of
    // the collection. Least recently stored goes first.
    const entries = Object.keys(store)
      .filter((name) => name.startsWith(STORAGE_KEY_PREFIX) && name !== `${STORAGE_KEY_PREFIX}${key}`)
      .map((name) => {
        try {
          return { name, storedAt: Number(JSON.parse(store.getItem(name))?.storedAt) || 0 };
        } catch {
          // An unreadable entry is the first one worth dropping.
          return { name, storedAt: 0 };
        }
      })
      .sort((left, right) => left.storedAt - right.storedAt);
    for (const { name } of entries.slice(0, Math.max(0, entries.length - (STORED_RESPONSE_LIMIT - 1)))) store.removeItem(name);
    store.setItem(`${STORAGE_KEY_PREFIX}${key}`, raw);
  } catch {
    try {
      for (const name of Object.keys(store)) {
        if (name.startsWith(STORAGE_KEY_PREFIX)) store.removeItem(name);
      }
    } catch { /* the cache is optional */ }
  }
}

/**
 * The response for a view this tab has already seen, if it is recent enough to
 * paint at once. Callers must still fetch: this only replaces the first
 * spinner with the products the customer last saw.
 */
export function storedExtendedRange(query = '', options = {}) {
  const key = instoreRequestKey(query, options);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  return readStored(key);
}

export async function fetchExtendedRange(query = '', { signal, page = 1, category = '', includeCatalogue = false } = {}) {
  const cacheKey = instoreRequestKey(query, { page, category, includeCatalogue });
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  // The preview may be reading a few thousand staged products. Give its
  // protected, server-side eligibility checks enough time to finish instead
  // of turning a slow-but-valid response into a false loading failure.
  const { response, data } = await authenticatedGetJson(`/api/extended-range?${cacheKey}`, { signal, timeoutMs: 45000 });
  if (!response.ok) throw new Error('Unable to load Instore Products. Please try again.');
  if (!signal?.aborted) {
    responseCache.set(cacheKey, { data, expiresAt: Date.now() + RESPONSE_CACHE_TTL_MS });
    if (!includeCatalogue) writeStored(cacheKey, data);
    if (responseCache.size > 40) {
      for (const [key, value] of responseCache) {
        if (value.expiresAt <= Date.now()) responseCache.delete(key);
      }
    }
  }
  return data;
}

/**
 * The complete eligible collection, fetched once per tab in the background so
 * that searching, browsing a category and paging need no further request. The
 * server has already applied every image, price, stock and duplicate check;
 * this is the same already-verified data the grid is built from, so the page
 * filters and ranks it with the shared functions the API itself uses.
 *
 * Returns null when it is not available. Callers must keep working from the
 * paged endpoint in that case.
 */
export function loadInstoreCatalogue() {
  if (catalogueProducts) return Promise.resolve(catalogueProducts);
  if (!catalogueRequest) {
    catalogueRequest = fetchExtendedRange('', { page: 1, includeCatalogue: true })
      .then((data) => {
        const products = Array.isArray(data?.catalogue) ? data.catalogue : null;
        catalogueProducts = products?.length ? products : null;
        return catalogueProducts;
      })
      .catch(() => null)
      .finally(() => { catalogueRequest = null; });
  }
  return catalogueRequest;
}

export function instoreCatalogue() {
  return catalogueProducts;
}
