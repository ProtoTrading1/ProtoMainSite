import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogueSearchQueryFromRoute } from '../src/lib/catalogueSearchRoute.js';
import {
  RESPONSE_CACHE_TTL_MS, STORAGE_KEY_PREFIX, STORED_RESPONSE_LIMIT, STORED_RESPONSE_MAX_AGE_MS,
  STORED_RESPONSE_MAX_BYTES, instoreRequestKey, storedResponseIsUsable,
} from '../lib/instore-response-cache.mjs';

const readSource = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('a view is identified by the request the API is asked for', () => {
  assert.equal(instoreRequestKey(''), 'page=1');
  assert.equal(instoreRequestKey('  wooden bracelet '), 'q=wooden+bracelet&page=1');
  assert.equal(instoreRequestKey('', { category: 'Soft toys', page: 3 }), 'category=Soft+toys&page=3');
  assert.equal(instoreRequestKey('', { includeCatalogue: true }), 'catalogue=1&page=1');
  // The same view is the same key whichever way the page arrives.
  assert.equal(instoreRequestKey('bead', { page: '2' }), instoreRequestKey('bead', { page: 2 }));
  // A nonsense page is the first page, never a key that misses the cache.
  for (const page of [0, -4, 'soon', null, undefined]) {
    assert.equal(instoreRequestKey('', { page }), 'page=1');
  }
});

test('only a recent, well-formed stored response may be shown while revalidating', () => {
  const now = Date.UTC(2026, 8, 24, 12, 0, 0);
  const entry = { storedAt: now - 1000, data: { products: [{ sku: 'A' }], total: 1 } };
  assert.equal(storedResponseIsUsable(entry, { now }), true);
  assert.equal(storedResponseIsUsable({ ...entry, storedAt: now - STORED_RESPONSE_MAX_AGE_MS }, { now }), true);
  assert.equal(storedResponseIsUsable({ ...entry, storedAt: now - STORED_RESPONSE_MAX_AGE_MS - 1 }, { now }), false);
  // A clock change is not a response from the future.
  assert.equal(storedResponseIsUsable({ ...entry, storedAt: now + 60_000 }, { now }), false);
  for (const broken of [
    null, undefined, 'a string', 42,
    { data: { products: [] } },
    { storedAt: now, data: null },
    { storedAt: now, data: { products: 'not a list' } },
    { storedAt: 'yesterday', data: { products: [] } },
  ]) {
    assert.equal(storedResponseIsUsable(broken, { now }), false, `${JSON.stringify(broken)} is discarded`);
  }
  // An empty result page is a real answer and is worth showing again.
  assert.equal(storedResponseIsUsable({ storedAt: now, data: { products: [], total: 0 } }, { now }), true);
});

test('the cache windows stay small enough to be an optimisation, not a second catalogue', () => {
  assert.equal(RESPONSE_CACHE_TTL_MS, 30_000);
  // Close to the server's own 150s snapshot window.
  assert.ok(STORED_RESPONSE_MAX_AGE_MS <= 600_000, 'a stored view is minutes old at most');
  assert.ok(STORED_RESPONSE_MAX_BYTES < 1_000_000, 'the whole collection is never written to browser storage');
  assert.ok(STORED_RESPONSE_LIMIT <= 12, 'only a handful of recently seen views are kept');
  assert.match(STORAGE_KEY_PREFIX, /^proto_instore_response_v\d+:$/);
});

test('stored browsing data is per tab and is dropped on sign-out', async () => {
  const [range, auth] = await Promise.all([
    readSource('src/lib/extendedRange.js'),
    readSource('src/lib/auth.js'),
  ]);
  // sessionStorage, not localStorage: it goes when the tab does.
  assert.match(range, /window\.sessionStorage/);
  assert.doesNotMatch(range, /localStorage/);
  // Every read and write tolerates blocked or full site data.
  assert.match(range, /export function clearStoredInstoreResponses\(\)/);
  assert.match(auth, /clearStoredInstoreResponses\(\);[\s\S]*supabase\.auth\.signOut\(\)/);
  // The full collection is held in memory only.
  assert.match(range, /if \(!includeCatalogue\) writeStored\(cacheKey, data\);/);
});

test('the page answers locally once it holds the collection, and prefetches out of the way', async () => {
  const page = await readSource('src/components/ExtendedRangePage.jsx');
  // The server's own page definition, not a second copy of the rules.
  assert.match(page, /import \{ INSTORE_PAGE_SIZE, instorePage \} from '\.\.\/\.\.\/lib\/instore-page\.mjs'/);
  assert.match(page, /const view = instorePage\(catalogue, \{ query: submittedQuery, category, page, pageSize: PAGE_SIZE \}\)/);
  // No request is made while the collection is held, nor before this browser's
  // own store has been consulted.
  assert.match(page, /if \(catalogue \|\| !localChecked\) return undefined;\s*const controller = new AbortController\(\)/);
  // A previously seen view is painted before the network answers.
  assert.match(page, /const stored = storedExtendedRange\(submittedQuery, \{ page, category, exact \}\)/);
  assert.match(page, /setLoading\(!stored\)/);
  // The page joins the boot load rather than starting a second one.
  assert.match(page, /prefetchInstoreCatalogue\(\)\.then\(\(collection\) => \{/);
  assert.doesNotMatch(page, /loadInstoreCatalogue/);
});

test('the Instore collection is loaded during portal boot, like the main catalogue', async () => {
  const [products, range] = await Promise.all([
    readSource('src/lib/products.js'),
    readSource('src/lib/extendedRange.js'),
  ]);

  // Started by the same boot routine that starts the main catalogue, so
  // opening Instore Products is not the moment it gets downloaded.
  assert.match(products, /export function prefetchCatalog\(\)[\s\S]*module\.prefetchInstoreCatalogue\(\)/);
  // ...but only once the main catalogue payload is in: the storefront's own
  // products must never queue behind the extended range.
  assert.match(products, /void getAllCached\(\)\s*\.catch\(\(\) => null\)\s*\.then\(\(\) => import\('\.\/extendedRange'\)\)/);

  // One entry point, so every caller gets the idle and connection guards.
  assert.match(range, /export function prefetchInstoreCatalogue\(\)/);
  assert.match(range, /connection\?\.saveData \|\| \['slow-2g', '2g'\]\.includes\(connection\?\.effectiveType\)/);
  assert.match(range, /requestIdleCallback\(start, \{ timeout: 5000 \}\)/);
  // It resolves with the collection so a page can join a running load.
  assert.match(range, /if \(catalogueRequest\) return catalogueRequest;/);
});

test('the local copy is read at once, and only the download waits for idle', async () => {
  const [range, products] = await Promise.all([
    readSource('src/lib/extendedRange.js'),
    readSource('src/lib/products.js'),
  ]);

  // Reading our own store is free, so it must not sit behind requestIdleCallback.
  assert.match(range, /export function hydrateInstoreCatalogue\(\)/);
  const hydrate = range.slice(range.indexOf('export function hydrateInstoreCatalogue'), range.indexOf('function fetchWhenIdle'));
  assert.doesNotMatch(hydrate, /requestIdleCallback|setTimeout/);
  // Only the network download is deferred and connection-guarded.
  assert.match(range, /function fetchWhenIdle\(\)[\s\S]*requestIdleCallback/);
  assert.match(range, /function fetchWhenIdle\(\)[\s\S]*connection\?\.saveData/);
  // Boot reads the local copy immediately; only the download queues behind the
  // main catalogue.
  assert.match(products, /module\.hydrateInstoreCatalogue\(\)/);
  assert.match(products, /void getAllCached\(\)\s*\.catch\(\(\) => null\)\s*\.then\(\(\) => import\('\.\/extendedRange'\)\)\s*\.then\(\(module\) => module\.prefetchInstoreCatalogue\(\)\)/);
});

test('the first screen of Instore images is warmed like the main catalogue warms its own', async () => {
  const range = await readSource('src/lib/extendedRange.js');
  assert.match(range, /import \{ preloadProductImages \} from '\.\/imageUrl'/);
  // Warmed from both the stored copy and a fresh download.
  assert.match(range, /preloadLandingImages\(persisted\)/);
  assert.match(range, /preloadLandingImages\(products\)/);
  // The landing order the customer actually sees, not an arbitrary slice.
  assert.match(range, /instorePage\(products, \{ pageSize: LANDING_IMAGE_PRELOAD \}\)/);
  // About a screenful, not the main catalogue's 60.
  assert.match(range, /const LANDING_IMAGE_PRELOAD = 24;/);
});

test('the page makes no request until this browser\'s own store has been consulted', async () => {
  const page = await readSource('src/components/ExtendedRangePage.jsx');
  assert.match(page, /if \(catalogue \|\| !localChecked\) return undefined;/);
  assert.match(page, /hydrateInstoreCatalogue\(\)[\s\S]*setLocalChecked\(true\)/);
});

test('a landing page is one database round trip, and the rest still are not', async () => {
  const [api, store] = await Promise.all([
    readSource('api/extended-range.js'),
    readSource('api/_instore-catalogue.js'),
  ]);
  assert.match(store, /export async function readCatalogueView\(/);
  // Used only where it is the whole answer.
  assert.match(api, /if \(!searchPatterns\.length && !structuredOnly && !includeCatalogue\) \{/);
  // A database without migration 072, or any other failure, falls through to
  // the reads it replaces rather than failing the request.
  assert.match(api, /console\.error\('instore catalogue view unusable:'[\s\S]*\n\s*\}\s*\n\s*\}/);
  // The freshness and control rules are the same ones, not a second copy.
  assert.match(api, /catalogueSnapshotIsFresh\(view\.state, view\.fingerprint, ttlMs\)/);
});

test('the collection survives a reload without downloading again', async () => {
  const range = await readSource('src/lib/extendedRange.js');

  // IndexedDB, like the main catalogue, and its own database rather than
  // sharing the catalogue's.
  assert.match(range, /const IDB_NAME = 'proto-instore';/);
  assert.doesNotMatch(range, /'proto-catalogue'/);
  // A much shorter window than the main catalogue's 24 hours, because these
  // rows carry live stock figures.
  assert.match(range, /const PERSISTED_COLLECTION_MAX_AGE_MS = 1_800_000;/);
  // A stored collection is adopted as soon as it is read...
  assert.match(range, /if \(persisted && !catalogueProducts\) \{\s*\n\s*catalogueProducts = persisted;/);
  // ...and refreshed behind the customer rather than awaited.
  assert.match(range, /if \(local\) \{[\s\S]*void fetchWhenIdle\(\);\s*\n\s*return local;/);
  // Nothing stale, nothing shaped for older code, and nothing left at sign-out.
  assert.match(range, /if \(!Array\.isArray\(entry\?\.data\) \|\| !entry\.data\.length\) return null;/);
  assert.match(range, /request\.transaction\.objectStore\(IDB_STORE\)\.clear\(\)/);
  // Runtime clear/pending-response behavior is covered by instore-gallery-refresh.spec.js.
});

test('the API and the browser share one page definition', async () => {
  const [api, shared] = await Promise.all([
    readSource('api/extended-range.js'),
    readSource('lib/instore-page.mjs'),
  ]);
  assert.match(shared, /export function instorePage\(/);
  assert.match(api, /import \{ instorePage \} from '\.\.\/lib\/instore-page\.mjs'/);
  // The API must not keep a private copy of the filter-and-rank rules.
  assert.doesNotMatch(api, /\.sort\(\(left, right\) => compareInstoreSearch/);
});

async function isolatedRange(id) {
  const moduleUrl = new URL('../src/lib/extendedRange.js', import.meta.url);
  const source = await readFile(moduleUrl, 'utf8');
  const substituted = source
    .replace("import { authenticatedGetJson } from './authHeaders';", 'const authenticatedGetJson = () => { throw Error("No network in cache test"); };')
    .replace("import { preloadProductImages } from './imageUrl';", 'const preloadProductImages = () => {};')
    .replace(/from '(\.[^']+)'/g, (_, relative) => `from '${new URL(relative, moduleUrl).href}'`);
  return import(`data:text/javascript;base64,${Buffer.from(substituted).toString('base64')}#${id}`);
}

function fixtureIndexedDb(t) {
  const original = globalThis.indexedDB;
  const opens = [];
  globalThis.indexedDB = { open() { const request = {}; opens.push(request); return request; } };
  t.after(() => {
    if (original === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = original;
  });
  return opens;
}

test('a stalled optional IndexedDB read cannot hold the In-store page beyond its head start or replace a fresh result', async (t) => {
  const opens = fixtureIndexedDb(t);
  const range = await isolatedRange('stall');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hydration = range.hydrateInstoreCatalogue();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opens.length, 1);
  t.mock.timers.tick(180);
  assert.equal(await hydration, null, 'page can use the authenticated paged fallback');
  const open = opens[0];
  let aborts = 0;
  let closes = 0;
  open.transaction = { abort() { aborts++; } };
  open.onupgradeneeded();
  assert.equal(aborts, 1, 'a late upgrade is aborted instead of writing or clearing');
  open.result = { close() { closes++; }, transaction() { assert.fail('No late store access'); } };
  open.onsuccess();
  assert.equal(closes, 1);
  assert.equal(range.instoreCatalogue(), null, 'a late cache read cannot be published over a paged answer');

  // An already-started read may finish after the deadline, but cannot publish
  // its rows or trigger a cache write.
  const readingRange = await isolatedRange('reading-after-deadline');
  const pendingRead = readingRange.hydrateInstoreCatalogue();
  await new Promise(resolve => setImmediate(resolve));
  const read = { result: { ts: Date.now(), data: [{ sku: 'LATE-PERSISTED' }] } };
  opens[1].result = { close() { closes++; }, transaction(_store, mode) {
    assert.equal(mode, 'readonly');
    return { objectStore() { return { get() { return read; } }; } };
  } };
  opens[1].onsuccess();
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(180);
  assert.equal(await pendingRead, null);
  read.onsuccess();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closes, 2);
  assert.equal(readingRange.instoreCatalogue(), null);
});

test('a timely stored catalogue still paints without a request and a blocked open closes any late handle', async (t) => {
  const opens = fixtureIndexedDb(t);
  const range = await isolatedRange('ready');
  const hydration = range.hydrateInstoreCatalogue();
  await new Promise(resolve => setImmediate(resolve));
  const read = { result: { ts: Date.now(), data: [{ sku: 'READY' }] } };
  const open = opens[0];
  let closes = 0;
  open.result = { close() { closes++; }, transaction() { return { objectStore() { return { get() { return read; } }; } }; } };
  open.onsuccess();
  await new Promise(resolve => setImmediate(resolve));
  read.onsuccess();
  assert.deepEqual(await hydration, [{ sku: 'READY' }]);
  assert.deepEqual(await range.hydrateInstoreCatalogue(), [{ sku: 'READY' }]);
  assert.equal(opens.length, 1);
  assert.equal(closes, 1);

  const blockedRange = await isolatedRange('blocked');
  const blocked = blockedRange.hydrateInstoreCatalogue();
  await new Promise(resolve => setImmediate(resolve));
  opens[1].onblocked();
  assert.equal(await blocked, null);
  opens[1].result = { close() { closes++; } };
  opens[1].onsuccess();
  assert.equal(closes, 2);
});

test('dedicated In-store navigation owns its results without suppressing combined Main results elsewhere', async () => {
  const app = await readSource('src/App.jsx');
  assert.match(app, /const viewingInstoreProducts = \['instore-products', 'extended-range'\]\.includes\(path\[0\]\);/);
  assert.match(app, /useInstoreSearch\(searchQuery, \{ enabled: instoreAvailable && !viewingInstoreProducts \}\)/);
  assert.match(app, /if \(viewingInstoreProducts\) return undefined;[\s\S]*const pageData = await withDeadline\(\(\) => fetchProductPage/);
  assert.match(app, /catalogRefreshKey, specialsMap, viewingInstoreProducts\]\);/);
  // The same displayed query belongs to a different owner on the dedicated
  // route. The legacy App log clears its Main analytics refs there and can
  // begin a fresh Main search log after navigation back.
  const q = 'hair clips';
  assert.deepEqual([[], ['instore-products'], ['extended-range'], []]
    .map(path => catalogueSearchQueryFromRoute(path, { q })), [q, '', '', q]);
  assert.match(app, /if \(!routeSearchQuery\.trim\(\)\) \{\s*searchTrackRef\.current = [\s\S]*?searchLogRequestRef\.current = null;\s*return;/);
});


test('account change keeps a blocked deletion fenced, even after next-generation hydration times out', async (t) => {
  const opens = fixtureIndexedDb(t);
  const range = await isolatedRange('clear-fence');
  t.mock.timers.enable({ apis: ['setTimeout'] });

  const oldHydration = range.hydrateInstoreCatalogue();
  await new Promise(resolve => setImmediate(resolve));
  const oldRead = { result: { ts: Date.now(), data: [{ sku: 'PRIOR-ACCOUNT' }] } };
  opens[0].result = { close() {}, transaction() { return { objectStore() { return { get() { return oldRead; } }; } }; } };
  opens[0].onsuccess();
  await new Promise(resolve => setImmediate(resolve));

  range.clearStoredInstoreResponses();
  const nextHydration = range.hydrateInstoreCatalogue();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opens.length, 2, 'only the pending sign-out deletion may start');
  const clear = opens[1];
  // IndexedDB reports a blocked request without completing it. Deletion must
  // not convert that event into a successful clear.
  clear.onblocked?.();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opens.length, 2, 'next-generation read stays behind the blocked delete');

  oldRead.onsuccess();
  assert.equal(await oldHydration, null, 'the old generation cannot publish');
  t.mock.timers.tick(180);
  assert.equal(await nextHydration, null, 'the next account can still use its usual authenticated network fallback');
  assert.equal(opens.length, 2, 'no prior persisted rows were read for the next account');

  let deletes = 0, closes = 0;
  const transaction = { objectStore() { return { delete() { deletes++; } }; } };
  clear.result = { close() { closes++; }, transaction(_store, mode) { assert.equal(mode, 'readwrite'); return transaction; } };
  clear.onsuccess();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(deletes, 1, 'delete eventually ran when the blocked connection opened');
  transaction.oncomplete();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closes, 1);
  assert.equal(opens.length, 2, 'the timed-out optional read does not restart after deletion');
  assert.equal(range.instoreCatalogue(), null);
});
