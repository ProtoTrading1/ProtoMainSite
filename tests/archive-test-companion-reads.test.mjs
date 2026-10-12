import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { ARCHIVE_TEST_BRANCH, ARCHIVE_TEST_URL, archiveTestRequestBlock, archiveTestPortalFetch } from '../api/_archive-test-client.js';
const env = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: ARCHIVE_TEST_BRANCH, ARCHIVE_TEST_READ_ONLY: '1', ARCHIVE_TEST_STOCK_URL: ARCHIVE_TEST_URL, ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY: 'synthetic-only' };
const routes = ['featured-products', 'sort-orders', 'taxonomy', 'banner', 'specials', 'popup-special'];
test('only audited companion GETs join the dedicated route allowlist; writes and refresh stay blocked', () => {
  for (const route of routes) {
    const url = `https://preview.vercel.app/api/${route}`;
    assert.equal(archiveTestRequestBlock(new Request(url), env), null);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(archiveTestRequestBlock(new Request(url, { method }), env).status, 403);
    assert.equal(archiveTestRequestBlock(new Request(url + '?refresh=1'), env).status, 403);
    assert.equal(archiveTestRequestBlock(new Request(url), { ...env, ARCHIVE_TEST_STOCK_URL: 'https://other.supabase.co' }).status, 503);
  }
  for (const route of ['orders', 'analytics', 'instore-catalogue-refresh', 'site-config', 'specials/extra']) assert.equal(archiveTestRequestBlock(new Request(`https://preview.vercel.app/api/${route}`), env).status, 403);
});
test('real SDK downloads and Just Added select pass constrained retained-portal transport, writes never reach it', async () => {
  const origin = 'https://synthetic-portal.supabase.co';
  const calls = [];
  const transport = archiveTestPortalFetch(origin, async (input, init) => {
    calls.push({ url: String(input), method: init.method });
    return new Response(String(input).includes('/rest/') ? '[]' : '{"items":[]}', { headers: { 'Content-Type': 'application/json' } });
  });
  const client = createClient(origin, 'synthetic-not-a-real-key', { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: transport } });
  for (const file of ['featured-products.json', 'sort-orders/orders.json', 'taxonomy/categories.json', 'taxonomy/mottaro-hidden.json', 'banner.json', 'specials.json', 'popup-special.json']) {
    const result = await client.storage.from('site-config').download(file);
    assert.equal(result.error, null);
  }
  assert.equal((await client.from('just_added_order_state').select('sku_order,updated_at').eq('id', true)).error, null);
  assert.equal(calls.length, 8);
  // Exercise the SDK's actual mutation paths, not only hand-made HTTP requests.
  assert.ok((await client.storage.from('site-config').upload('specials.json', '{}')).error);
  assert.ok((await client.storage.createBucket('site-config')).error);
  assert.ok((await client.from('just_added_order_state').update({ sku_order: [] }).eq('id', true)).error);
  assert.equal(calls.length, 8);
  for (const url of [origin + '/storage/v1/object/site-config/orders/notify/private.json', origin + '/rest/v1/customers', ARCHIVE_TEST_URL + '/rest/v1/just_added_order_state']) await assert.rejects(transport(url));
  await assert.rejects(archiveTestPortalFetch(origin, async () => new Response(null, { status: 302 }))(origin + '/storage/v1/object/site-config/banner.json'), /REDIRECT/);
  await assert.rejects(archiveTestPortalFetch(origin, async () => { throw new Error('synthetic-private-error'); })(origin + '/storage/v1/object/site-config/banner.json'), error => error.message === 'ARCHIVE_TEST_PORTAL_TRANSPORT_FAILED');
});
test('actual specials GET reads existing JSON and never calls bucket creation/upload', async () => {
  const source = await readFile(new URL('../api/specials.js', import.meta.url), 'utf8');
  const handlerSource = source.slice(source.indexOf('export default async function handler')).replace('export default ', '');
  let downloads = 0;
  const forbidden = () => { throw new Error('unexpected mutation/auth'); };
  const client = { storage: { createBucket: forbidden, from: () => ({ upload: forbidden, download: async () => { downloads++; return { data: { text: async () => '{"items":[{"sku":"SYN"}]}' }, error: null }; } }) } };
  const handler = new Function('getPortalAdminClient', 'requireAdmin', 'BUCKET', 'FILE', handlerSource + ';return handler;')(() => client, forbidden, 'site-config', 'specials.json');
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method: 'GET' }, res);
  assert.equal(res.code, 200); assert.equal(downloads, 1); assert.deepEqual(res.body.items, [{ sku: 'SYN' }]);
});
