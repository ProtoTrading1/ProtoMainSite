import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  // No request is made while the collection is held.
  assert.match(page, /if \(catalogue\) return undefined;\s*const controller = new AbortController\(\)/);
  // A previously seen view is painted before the network answers.
  assert.match(page, /const stored = storedExtendedRange\(submittedQuery, \{ page, category \}\)/);
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

test('the collection survives a reload without downloading again', async () => {
  const range = await readSource('src/lib/extendedRange.js');

  // IndexedDB, like the main catalogue, and its own database rather than
  // sharing the catalogue's.
  assert.match(range, /const IDB_NAME = 'proto-instore';/);
  assert.doesNotMatch(range, /'proto-catalogue'/);
  // A much shorter window than the main catalogue's 24 hours, because these
  // rows carry live stock figures.
  assert.match(range, /const PERSISTED_COLLECTION_MAX_AGE_MS = 1_800_000;/);
  // A stored collection is used at once and refreshed behind the customer.
  assert.match(range, /catalogueProducts = persisted;\s*\n\s*void fetchCollection\(\)/);
  // Nothing stale, nothing shaped for older code, and nothing left at sign-out.
  assert.match(range, /if \(!Array\.isArray\(entry\?\.data\) \|\| !entry\.data\.length\) return null;/);
  assert.match(range, /request\.transaction\.objectStore\(IDB_STORE\)\.clear\(\)/);
  assert.match(range, /void clearPersistedCollection\(\)/);
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
