import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ARCHIVE_TEST_URL, ARCHIVE_TEST_BRANCH, validateArchiveTestConfig, createArchiveTestClient, archiveTestFetch, archiveTestRequestBlock } from '../api/_archive-test-client.js';
import { readOnlyBrowserFetch } from '../src/lib/archive-test-browser-fetch.mjs';
const env = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: ARCHIVE_TEST_BRANCH, ARCHIVE_TEST_READ_ONLY: '1', ARCHIVE_TEST_STOCK_URL: ARCHIVE_TEST_URL, ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY: 'synthetic-server-only-marker', VITE_STOCK_SUPABASE_KEY: 'synthetic-public-marker' };
test('fixed preview config fails before SDK construction; public or inherited keys cannot substitute', () => {
  let calls = 0;
  const factory = () => { calls++; };
  for (const patch of [{ ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY: '' }, { VERCEL_ENV: 'production' }, { VERCEL_GIT_COMMIT_REF: 'main' }, { ARCHIVE_TEST_READ_ONLY: '' }, ...['https://other.supabase.co', ARCHIVE_TEST_URL + '/', ARCHIVE_TEST_URL + '?x=1', ARCHIVE_TEST_URL + '#x', ARCHIVE_TEST_URL + ':443', 'https://user@aovcrilrgistrdcgtdgl.supabase.co'].map(ARCHIVE_TEST_STOCK_URL => ({ ARCHIVE_TEST_STOCK_URL }))]) {
    assert.throws(() => createArchiveTestClient({ env: { ...env, ...patch }, factory }));
  }
  assert.equal(calls, 0);
  const client = createArchiveTestClient({ env, factory: (url, key, options) => ({ url, key, options }) });
  assert.equal(client.url, ARCHIVE_TEST_URL); assert.equal(client.key, 'synthetic-server-only-marker');
  assert.equal(client.options.auth.persistSession, false); assert.equal(validateArchiveTestConfig(env).url, ARCHIVE_TEST_URL);
});
test('stock transport denies writes, cross-target URLs, redirects and scalar error exposure', async () => {
  let calls = 0; const fetch = archiveTestFetch(async () => { calls++; return new Response('[]'); });
  for (const [url, method] of [[ARCHIVE_TEST_URL + '/rest/v1/products', 'PATCH'], [ARCHIVE_TEST_URL + '/rest/v1/rpc/archive_review_promote', 'POST'], [ARCHIVE_TEST_URL + '/rest/v1/rpc/claim_instore_catalogue_refresh', 'POST'], [ARCHIVE_TEST_URL + '/storage/v1/bucket', 'POST'], ['https://other.supabase.co/rest/v1/products', 'GET']]) await assert.rejects(fetch(url, { method }));
  assert.equal(calls, 0); await fetch(ARCHIVE_TEST_URL + '/rest/v1/products'); assert.equal(calls, 1);
  await assert.rejects(archiveTestFetch(async () => new Response(null, { status: 302 }))(ARCHIVE_TEST_URL + '/rest/v1/products'), /REDIRECT/);
  await assert.rejects(archiveTestFetch(async () => { throw new Error('synthetic-server-only-marker'); })(ARCHIVE_TEST_URL + '/rest/v1/products'), error => error.message === 'ARCHIVE_TEST_TRANSPORT_FAILED');
});
test('middleware allowlist denies mutating methods and unrelated GET routes before handler execution', () => {
  const path = ARCHIVE_TEST_BRANCH.includes('-admin-') ? '/api/archive-review' : '/api/products';
  assert.equal(archiveTestRequestBlock(new Request('https://preview.vercel.app' + path), env), null);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) assert.equal(archiveTestRequestBlock(new Request('https://preview.vercel.app' + path, { method }), env).status, 403);
  for (const path of ['/api/instore-catalogue-refresh', '/api/send-order', '/api/analytics', '/api/Products', '/api/customer-profile?refresh=1']) assert.equal(archiveTestRequestBlock(new Request('https://preview.vercel.app' + path), env).status, 403);
  assert.equal(archiveTestRequestBlock(new Request('https://preview.vercel.app' + path), { ...env, ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY: '' }).status, 503);
});
test('browser transport blocks direct retained-project writes and external traffic; permits owner login only', async () => {
  let calls = 0; const fetch = readOnlyBrowserFetch(async () => { calls++; return new Response('{}'); }, { origin: 'https://preview.vercel.app', authOrigin: 'https://auth.supabase.co' });
  for (const [url, method] of [['https://auth.supabase.co/rest/v1/customers', 'PATCH'], ['https://auth.supabase.co/storage/v1/object/site-config/x', 'POST'], ['https://auth.supabase.co/auth/v1/signup', 'POST'], ['https://other.supabase.co/auth/v1/user', 'GET'], ['/api/send-order', 'POST']]) await assert.rejects(fetch(url, { method }));
  assert.equal(calls, 0);
  await fetch('/api/products'); await fetch('https://auth.supabase.co/auth/v1/user'); await fetch('https://auth.supabase.co/auth/v1/token?grant_type=password', { method: 'POST' }); assert.equal(calls, 3);
});
test('private factory is not imported by browser source; guard installs before application boot', async () => {
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8'); assert.ok(main.startsWith("import './lib/archive-test-browser-guard.js';"));
  const guard = await readFile(new URL('../src/lib/archive-test-browser-guard.js', import.meta.url), 'utf8'); assert.ok(!guard.includes('SERVICE_ROLE_KEY')); assert.ok(!guard.includes('_archive-test-client'));
});

test('actual In-store dedicated GET never reads or writes stored snapshots', async () => {
  const source = await readFile(new URL('../api/extended-range.js', import.meta.url), 'utf8');
  const handlerSource = source.slice(source.indexOf('export default async function handler')).replace('export default ', '');
  let liveReads = 0; const forbidden = () => { throw new Error('snapshot refresh/read must not run'); };
  const deps = { process: { env: { ARCHIVE_TEST_READ_ONLY: '1' } }, console: { error: forbidden }, PAGE_SIZE: 24, SOURCE_LABEL: 'synthetic', requireApprovedCustomer: async () => ({}), normalizePage: () => 1, isIsolatedPreviewRequest: () => false, stockClient: () => ({}), readArchiveInstoreRevision: async () => null, normalizeQuery: () => '', serveStoredCatalogue: forbidden, claimCatalogueRefresh: forbidden, releaseCatalogueRefresh: forbidden, storeInstoreCatalogue: forbidden, getCachedCatalogue: (_key, load) => load(), loadLiveInstoreCatalogue: async () => { liveReads++; return { products: [] }; }, instorePage: () => ({ from: 0, total: 0, products: [] }), discoveryTiles: () => [] };
  const handler = new Function(...Object.keys(deps), handlerSource + ';return handler;')(...Object.values(deps));
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ method: 'GET', query: {}, headers: {} }, res); assert.equal(res.code, 200); assert.equal(liveReads, 1); assert.deepEqual(res.data.products, []);
});
