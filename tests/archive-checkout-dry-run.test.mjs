import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createArchiveCheckoutHandler } from '../api/archive-checkout-dry-run.js';
import { ARCHIVE_CHECKOUT_BRANCH, ARCHIVE_CHECKOUT_SCOPE, ARCHIVE_CHECKOUT_PORTAL, ARCHIVE_CHECKOUT_STOCK, ARCHIVE_CHECKOUT_OWNER, ARCHIVE_CHECKOUT_EMAIL, validateArchiveCheckoutConfig } from '../api/_archive-checkout-config.js';
const sha = 'a'.repeat(40);
const env = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: ARCHIVE_CHECKOUT_BRANCH, VERCEL_GIT_COMMIT_SHA: sha, VERCEL_URL: 'synthetic-preview.vercel.app', VERCEL_DEPLOYMENT_ID: 'dpl_synthetic', ARCHIVE_TEST_READ_ONLY: '1', ARCHIVE_TEST_CHECKOUT_SCOPE: ARCHIVE_CHECKOUT_SCOPE, VITE_ARCHIVE_TEST_CHECKOUT_SCOPE: ARCHIVE_CHECKOUT_SCOPE, ARCHIVE_CHECKOUT_EXPECTED_COMMIT: sha, ARCHIVE_CHECKOUT_AUTH_URL: ARCHIVE_CHECKOUT_PORTAL, VITE_SUPABASE_URL: ARCHIVE_CHECKOUT_PORTAL, ARCHIVE_TEST_STOCK_URL: ARCHIVE_CHECKOUT_STOCK, ARCHIVE_CHECKOUT_TEST_USER_ID: ARCHIVE_CHECKOUT_OWNER, ARCHIVE_CHECKOUT_TEST_EMAIL: ARCHIVE_CHECKOUT_EMAIL, VITE_SUPABASE_ANON_KEY: 'synthetic-anon', ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY: 'synthetic-private' };
const proof = { sha, branch: ARCHIVE_CHECKOUT_BRANCH, environment: 'preview', url: env.VERCEL_URL, deploymentId: env.VERCEL_DEPLOYMENT_ID, scope: ARCHIVE_CHECKOUT_SCOPE };
const requestId = '00000000-0000-4000-8000-000000000001';
function fixture(sku = 'SYN-AR26-MAIN') {
  return { user: { id: ARCHIVE_CHECKOUT_OWNER, email: ARCHIVE_CHECKOUT_EMAIL }, profile: { id: ARCHIVE_CHECKOUT_OWNER, email: ARCHIVE_CHECKOUT_EMAIL, role: 'customer', is_approved: true, trade_email_verification_required: false }, row: { sku, barcode: sku, price: 115, units_of_issue: 'EACH', min_order_qty: 1, available_stock: 20, archive_review_request_id: requestId, image_source_key: 'archive-review:' + requestId, is_active: true, visibility_status: 'search_only', image_review_status: 'verified' }, metadata: { sku, barcode: sku, destination: sku.endsWith('MAIN') ? 'main' : 'instore', requestId, price: 115, price_source: 'positill_website_inclusive', units_of_issue: 'EACH', min_order_qty: 1 } };
}
async function invoke({ body = { sku: 'SYN-AR26-MAIN', qty: 1 }, method = 'POST', url = '/api/archive-checkout-dry-run', config = env, buildProof = proof, data = fixture(body?.sku), headers = { authorization: 'Bearer synthetic-token' }, response } = {}) {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    if (response) return response();
    return new Response(JSON.stringify(url.includes('/auth/') ? data.user : url.includes('/customers?') ? [data.profile] : url.includes('/rpc/') ? [data.metadata] : [data.row]));
  };
  const res = { setHeader() {}, status(status) { this.statusCode = status; return this; }, json(body) { this.body = body; return this; } };
  await createArchiveCheckoutHandler({ env: config, buildProof, transport })({ method, url, body, headers }, res);
  return { res, calls };
}
test('Main and In-store exact validation only reads owner and test stock', async () => {
  for (const sku of ['SYN-AR26-MAIN', 'SYN-AR26-STORE']) {
    const { res, calls } = await invoke({ body: { sku, qty: 10 } });
    assert.equal(res.statusCode, 200); assert.equal(res.body.writesPerformed, false); assert.equal(calls.length, 4);
    assert.ok(calls.every(call => call.init.method === 'GET' || call.url.includes('/rest/v1/rpc/archive_review_')));
    assert.deepEqual(JSON.parse(calls[3].init.body), { p_skus: [sku] });
    assert.ok(calls.every(call => call.init.redirect === 'manual'));
    assert.ok(calls[0].url.startsWith(ARCHIVE_CHECKOUT_PORTAL)); assert.ok(calls[2].url.startsWith(ARCHIVE_CHECKOUT_STOCK));
    assert.ok(!JSON.stringify(res.body).includes('synthetic-private'));
  }
});
test('each mandatory configuration and proof field fails before transport', async () => {
  for (const key of Object.keys(env)) {
    const { res, calls } = await invoke({ config: { ...env, [key]: '' } }); assert.equal(res.statusCode, 503, key); assert.equal(calls.length, 0, key);
  }
  for (const key of Object.keys(proof)) assert.throws(() => validateArchiveCheckoutConfig(env, { ...proof, [key]: 'wrong' }));
  assert.throws(() => validateArchiveCheckoutConfig(env, null));
  for (const patch of [{ VERCEL_ENV: 'production' }, { VERCEL_GIT_COMMIT_REF: 'main' }, { VITE_SUPABASE_URL: ARCHIVE_CHECKOUT_PORTAL + '/' }, { ARCHIVE_TEST_STOCK_URL: ARCHIVE_CHECKOUT_STOCK + '?x=1' }, { ARCHIVE_CHECKOUT_TEST_EMAIL: 'other@example.com' }, { VERCEL_GIT_COMMIT_SHA: 'b'.repeat(40) }]) assert.throws(() => validateArchiveCheckoutConfig({ ...env, ...patch }, proof));
});
test('strict method, raw no-query path and payload reject without calls', async () => {
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.equal((await invoke({ method })).calls.length, 0);
  for (const url of ['/api/archive-checkout-dry-run?', '/api/archive-checkout-dry-run?x=1', '/api/archive-checkout-dry-run/', '/api/Archive-checkout-dry-run']) assert.equal((await invoke({ url })).res.statusCode, 400);
  for (const body of [null, [], {}, { sku: 'REAL', qty: 1 }, { sku: 'SYN-AR26-MAIN', qty: '1' }, { sku: 'SYN-AR26-MAIN', qty: 0 }, { sku: 'SYN-AR26-MAIN', qty: 11 }, { sku: 'SYN-AR26-MAIN', qty: 1.5 }, { sku: 'SYN-AR26-MAIN', qty: 1, price: 1 }]) {
    const { res, calls } = await invoke({ body, data: fixture() }); assert.equal(res.statusCode, 400); assert.equal(calls.length, 0);
  }
});
test('exact authenticated owner and approved matching profile required', async () => {
  assert.equal((await invoke({ headers: {} })).res.statusCode, 401);
  for (const field of ['id', 'email']) { const data = fixture(); data.user[field] = 'wrong'; assert.equal((await invoke({ data })).res.statusCode, 403); }
  for (const patch of [{ id: 'wrong' }, { email: 'wrong' }, { is_approved: false }, { role: 'unknown' }, { trade_email_verification_required: null }, { trade_email_verification_required: true, trade_email_verified_at: null }]) {
    const data = fixture(); Object.assign(data.profile, patch); const { res, calls } = await invoke({ data }); assert.equal(res.statusCode, 403); assert.equal(calls.length, 2);
  }
});
test('raw provenance and stock failures cannot use permissive defaults', async () => {
  for (const sku of ['SYN-AR26-MAIN', 'SYN-AR26-STORE']) {
    for (const patch of [{ min_order_qty: null }, { min_order_qty: 1.5 }, { units_of_issue: '' }, { units_of_issue: 'each' }, { requestId: 'invalid' }, { price_source: 'legacy' }, { price: null }]) {
      const data = fixture(sku); Object.assign(data.metadata, patch); assert.equal((await invoke({ body: { sku, qty: 1 }, data })).res.statusCode, 409);
    }
    const data = fixture(sku); data.row.available_stock = null; assert.equal((await invoke({ body: { sku, qty: 1 }, data })).res.statusCode, 409);
  }
});
test('redirects, private errors and malformed JSON produce safe errors', async () => {
  for (const response of [() => new Response(null, { status: 302 }), () => { throw new Error('synthetic-private'); }, () => new Response('invalid')]) {
    const { res } = await invoke({ response }); assert.equal(res.statusCode, 503); assert.ok(!JSON.stringify(res.body).includes('synthetic-private'));
  }
});
test('build rejects self-consistent Vercel metadata for an unrelated actual source checkout', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/check-archive-test-preview-env.mjs'], {
    cwd: new URL('..', import.meta.url), env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  }), error => String(error.stderr).includes('ARCHIVE_CHECKOUT_SOURCE_TREE_REJECTED') && !String(error.stderr).includes('synthetic-private'));
});
