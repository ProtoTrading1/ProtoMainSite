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
  // The prefetch waits for the first page and never runs on a metered link.
  assert.match(page, /if \(catalogue \|\| loading \|\| error \|\| !products\.length\) return undefined;/);
  assert.match(page, /connection\?\.saveData \|\| \['slow-2g', '2g'\]\.includes\(connection\?\.effectiveType\)/);
  assert.match(page, /requestIdleCallback/);
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
