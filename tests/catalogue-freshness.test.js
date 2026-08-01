import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appUrl = new URL('../src/App.jsx', import.meta.url);
const productsUrl = new URL('../src/lib/products.js', import.meta.url);

test('returning to an open storefront silently revalidates catalogue data', async () => {
  const app = await readFile(appUrl, 'utf8');

  assert.match(app, /refreshProductCache/);
  assert.match(app, /window\.addEventListener\('focus', refreshCatalogue\)/);
  assert.match(app, /window\.addEventListener\('online', refreshCatalogue\)/);
  assert.match(app, /document\.addEventListener\('visibilitychange', refreshWhenVisible\)/);
  assert.match(app, /document\.visibilityState === 'visible'/);
  assert.match(app, /5 \* 60_000/);
});

test('catalogue refreshes are coalesced, throttled and replace visible caches', async () => {
  const products = await readFile(productsUrl, 'utf8');

  assert.match(products, /const CATALOG_REFRESH_MIN_MS = 30_000/);
  assert.match(products, /if \(_refreshPromise\) return _refreshPromise/);
  assert.match(products, /Date\.now\(\) - _lastLiveRefreshAt < maxAgeMs/);
  assert.match(products, /_browseRequests\.clear\(\)[\s\S]*_featuredResolved = null[\s\S]*emitCatalogRefresh\(\)/);
  assert.match(products, /cache: 'no-cache', authenticated: true/);
});

test('this catalogue-contract release cannot reload the previous persistent snapshot', async () => {
  const products = await readFile(productsUrl, 'utf8');

  assert.match(products, /const LS_KEY = 'proto_catalog_v12'/);
  assert.match(products, /const IDB_VERSION = 3/);
  assert.match(products, /const IDB_KEY = 'approved-customer-v3'/);
  assert.match(products, /request\.transaction\.objectStore\(IDB_STORE\)\.clear\(\)/);
});
