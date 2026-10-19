import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createStockClient, resolveStockCredentials, stockFetch, STOCK_PROJECT_URL } from '../lib/stock-supabase.mjs';
const secret = 'sb_secret_CONTROLLED_FIXTURE_ONLY';
const jwt = claims => `eyJmaXh0dXJl.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.c2ln`;
const legacy = jwt({ role: 'service_role', ref: 'yiqsvwajozafvalwcero' });
const modern = { STOCK_SUPABASE_POOLER_URL: STOCK_PROJECT_URL, STOCK_SUPABASE_KEY: secret, VERCEL_ENV: 'production' };
test('explicit server binding wins and production target is pinned', () => {
 assert.deepEqual(resolveStockCredentials({ ...modern, VITE_STOCK_SUPABASE_URL: 'https://wrong.invalid', VITE_STOCK_SUPABASE_KEY: 'wrong' }), { url: STOCK_PROJECT_URL, key: secret });
 assert.deepEqual(resolveStockCredentials({ ...modern, STOCK_SUPABASE_KEY: legacy }), { url: STOCK_PROJECT_URL, key: legacy });
 assert.equal(resolveStockCredentials({ STOCK_SUPABASE_URL: STOCK_PROJECT_URL, STOCK_SUPABASE_KEY: secret }).url, STOCK_PROJECT_URL);
 assert.throws(() => resolveStockCredentials({ ...modern, STOCK_SUPABASE_POOLER_URL: 'https://pyrwimlmmruxtuxhdsom.supabase.co' }), /mismatch/);
 assert.equal(resolveStockCredentials({ ...modern, VERCEL_ENV: 'preview', STOCK_SUPABASE_POOLER_URL: 'https://pyrwimlmmruxtuxhdsom.supabase.co' }).url, 'https://pyrwimlmmruxtuxhdsom.supabase.co');
});
test('invalid explicit config cannot fall back to working legacy settings', () => {
 const old = { VITE_STOCK_SUPABASE_URL: STOCK_PROJECT_URL, VITE_STOCK_SUPABASE_KEY: legacy };
 for (const key of ['', ' ', 'sb_publishable_fixture', 'sb_secret_a', `${secret}\n`, 'invalid', jwt({ role: 'anon', ref: 'yiqsvwajozafvalwcero' }), jwt({ role: 'service_role', ref: 'pyrwimlmmruxtuxhdsom' }), 'eyJmaXh0dXJl.bm90LWpzb24.c2ln']) assert.throws(() => resolveStockCredentials({ ...old, ...modern, STOCK_SUPABASE_KEY: key }));
 for (const url of ['', 'http://yiqsvwajozafvalwcero.supabase.co', `${STOCK_PROJECT_URL}/rest/v1`, `${STOCK_PROJECT_URL}?x=y`, 'https://name:pass@yiqsvwajozafvalwcero.supabase.co', `${STOCK_PROJECT_URL}:443`, 'https://evil.invalid', ` ${STOCK_PROJECT_URL}`]) assert.throws(() => resolveStockCredentials({ ...old, ...modern, STOCK_SUPABASE_POOLER_URL: url }));
 assert.throws(() => resolveStockCredentials({ ...old, STOCK_SUPABASE_KEY: secret }));
 assert.throws(() => createStockClient({ env: { ...modern, STOCK_SUPABASE_KEY: '' }, optional: true }));
});
test('legacy per-client selection and optional PDF absence remain isolated', () => {
 const env = { VITE_STOCK_SUPABASE_URL: STOCK_PROJECT_URL, VITE_STOCK_SUPABASE_KEY: 'old-general', STOCK_SUPABASE_SERVICE_ROLE_KEY: 'old-instore' };
 assert.equal(resolveStockCredentials(env).key, 'old-general');
 assert.equal(resolveStockCredentials(env, { legacyServiceRole: true }).key, 'old-instore');
 assert.deepEqual(resolveStockCredentials({ VITE_STOCK_SUPABASE_URL: ` ${STOCK_PROJECT_URL} `, STOCK_SUPABASE_SERVICE_ROLE_KEY: ' old-instore ' }, { legacyServiceRole: true }), { url: STOCK_PROJECT_URL, key: 'old-instore' });
 assert.equal(createStockClient({ env: {}, optional: true }), null);
 assert.throws(() => resolveStockCredentials({ STOCK_SUPABASE_KEY: '', INSTORE_PREVIEW_SUPABASE_URL: STOCK_PROJECT_URL, INSTORE_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: secret }));
});
test('secret transport removes only its own bearer while preserving apikey, caller JWT and other headers', async () => {
 const calls = [];
 const fn = stockFetch(secret, async (...args) => { calls.push(args); return 'ok'; });
 await fn('https://example.invalid', { method: 'GET', headers: { apikey: secret, authorization: `Bearer ${secret}`, 'x-client-info': 'fixture' } });
 assert.equal(calls[0][1].headers.get('authorization'), null);
 assert.equal(calls[0][1].headers.get('apikey'), secret);
 assert.equal(calls[0][1].headers.get('x-client-info'), 'fixture');
 await fn(new Request('https://example.invalid', { headers: { authorization: `Bearer ${legacy}`, apikey: secret } }));
 assert.equal(calls[1][1].headers.get('authorization'), `Bearer ${legacy}`);
 const old = stockFetch(legacy, async (_, init) => init);
 assert.equal((await old('https://example.invalid', { headers: { authorization: `Bearer ${legacy}` } })).headers.get('authorization'), `Bearer ${legacy}`);
});
test('actual SDK mock read uses modern apikey without secret bearer, no live network', async () => {
 let count = 0;
 const client = createStockClient({ env: modern, fetchImpl: async (input, init) => {
  count++; assert.match(String(input), /^https:\/\/yiqsvwajozafvalwcero.supabase.co\/rest\/v1\/website_stock/);
  assert.equal(init.headers.get('apikey'), secret); assert.equal(init.headers.get('authorization'), null);
  return new Response(JSON.stringify([{ sku: 'fixture', stock_qty: -2 }]), { status: 200, headers: { 'content-type': 'application/json' } });
 } });
 const { data, error } = await client.from('website_stock').select('sku,stock_qty').limit(1);
 assert.equal(error, null); assert.equal(data[0].stock_qty, -2); assert.equal(count, 1);
});
test('scoped runtime clients and manual scripts share server module; browser code has no import', async () => {
 for (const file of ['api/products.js', 'api/stock.js', 'api/send-order.js', 'api/_order-pdf.js', 'api/extended-range.js']) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8'); assert.match(source, /createStockClient\(/);
  assert.doesNotMatch(source, /createClient\(\s*process.env.VITE_STOCK_SUPABASE/);
 }
 for (const file of ['sync-website-from-products.mjs','migrate-product-images.mjs','import-website-stock.mjs','apply-move-spreadsheet.mjs','generate-catalog.js','backup-stock-tables.mjs']) {
  const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8'); assert.match(source, /createStockClient\(\{ env: stockEnv \}\)/);
 }
 const preview = await readFile(new URL('../api/extended-range.js', import.meta.url), 'utf8');
 assert.match(preview, /createClient\(url, key, \{ auth: \{ autoRefreshToken: false, persistSession: false \} \}\)/);
 assert.match(preview, /INSTORE_PREVIEW_SUPABASE_URL/);
});
