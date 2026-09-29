import { authenticatedGetJson } from './authHeaders';
import { preloadProductImages } from './imageUrl';
import { instorePage } from '../../lib/instore-page.mjs';
import {
  RESPONSE_CACHE_TTL_MS, STORAGE_KEY_PREFIX, STORED_RESPONSE_LIMIT,
  STORED_RESPONSE_MAX_BYTES, instoreRequestKey, storedResponseIsUsable,
} from '../../lib/instore-response-cache.mjs';

// The collection is persisted the way the main catalogue is, so navigating to
// Instore Products — or reloading on it — does not download it again. Its own
// database, separate from the main catalogue's, and a much shorter window,
// because these rows carry live stock figures.
const IDB_NAME = 'proto-instore';
const IDB_STORE = 'collection';
const IDB_VERSION = 1;
const IDB_KEY = 'approved-customer-v1';
const PERSISTED_COLLECTION_MAX_AGE_MS = 1_800_000;
// Roughly the first screen of cards, rather than the main catalogue's 60: the
// rest arrive lazily as the customer scrolls.
const LANDING_IMAGE_PRELOAD = 24;

const responseCache = new Map();
let catalogueRequest = null;
let catalogueProducts = null;
let hydration = null;

function openCollectionDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      // A version release must not resurrect a collection shaped for older code.
      else request.transaction.objectStore(IDB_STORE).clear();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readPersistedCollection() {
  const db = await openCollectionDb();
  if (!db) return null;
  const entry = await new Promise((resolve) => {
    const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
  db.close();
  const age = Date.now() - Number(entry?.ts || 0);
  if (!Array.isArray(entry?.data) || !entry.data.length) return null;
  return Number.isFinite(age) && age >= 0 && age < PERSISTED_COLLECTION_MAX_AGE_MS ? entry.data : null;
}

async function writePersistedCollection(products) {
  const db = await openCollectionDb();
  if (!db) return;
  await new Promise((resolve) => {
    const transaction = db.transaction(IDB_STORE, 'readwrite');
    transaction.objectStore(IDB_STORE).put({ data: products, ts: Date.now() }, IDB_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
  db.close();
}

async function clearPersistedCollection() {
  const db = await openCollectionDb();
  if (!db) return;
  await new Promise((resolve) => {
    const transaction = db.transaction(IDB_STORE, 'readwrite');
    transaction.objectStore(IDB_STORE).delete(IDB_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = resolve;
    transaction.onabort = resolve;
  });
  db.close();
}

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
  hydration = null;
  void clearPersistedCollection().catch(() => {});
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
// The images the customer sees first, warmed the way the main catalogue warms
// its own card thumbnails, so the grid is populated rather than filling in.
function preloadLandingImages(products) {
  if (!products?.length) return;
  const landing = instorePage(products, { pageSize: LANDING_IMAGE_PRELOAD });
  preloadProductImages(landing.products.map((product) => product.image), { limit: LANDING_IMAGE_PRELOAD });
}

async function fetchCollection() {
  const data = await fetchExtendedRange('', { page: 1, includeCatalogue: true });
  const products = Array.isArray(data?.catalogue) && data.catalogue.length ? data.catalogue : null;
  if (products) {
    catalogueProducts = products;
    preloadLandingImages(products);
    await writePersistedCollection(products).catch(() => {});
  }
  return products;
}

/**
 * The collection from this browser's own store. No network and no waiting for
 * an idle moment: reading it is free, and it is what makes opening Instore
 * Products immediate rather than a request.
 */
export function hydrateInstoreCatalogue() {
  if (catalogueProducts) return Promise.resolve(catalogueProducts);
  if (!hydration) {
    hydration = readPersistedCollection()
      .then((persisted) => {
        if (persisted && !catalogueProducts) {
          catalogueProducts = persisted;
          preloadLandingImages(persisted);
        }
        return catalogueProducts;
      })
      .catch(() => null);
  }
  return hydration;
}

function fetchWhenIdle() {
  if (catalogueRequest) return catalogueRequest;
  const connection = typeof navigator === 'undefined' ? null : navigator.connection;
  // Nothing optional on a connection the customer pays for by the megabyte.
  if (connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType)) return Promise.resolve(catalogueProducts);
  catalogueRequest = new Promise((resolve) => {
    const start = () => resolve(fetchCollection().catch(() => null));
    if (typeof window === 'undefined') start();
    else if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: 5000 });
    else window.setTimeout(start, 1200);
  }).finally(() => { catalogueRequest = null; });
  return catalogueRequest;
}

export function instoreCatalogue() {
  return catalogueProducts;
}

/**
 * Start loading the Instore collection during portal boot, the way
 * prefetchCatalog() starts the main catalogue, so opening Instore Products is
 * not the moment it gets downloaded.
 *
 * The local copy is read straight away and returned if it is there; the
 * download only ever happens on an idle browser, and is a background refresh
 * when a local copy already answered. Resolves with the collection, or null,
 * so a page can join a load already running instead of starting a second one.
 */
export function prefetchInstoreCatalogue() {
  return hydrateInstoreCatalogue().then((local) => {
    if (local) {
      // Refresh behind the customer so the next view is current.
      void fetchWhenIdle();
      return local;
    }
    return fetchWhenIdle();
  });
}
