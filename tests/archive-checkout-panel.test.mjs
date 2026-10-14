import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveCheckoutPanelContext } from '../scripts/archive-checkout-panel-context.mjs';
import { panelAvailable, runFixtureValidation, sessionIssue } from '../src/lib/archiveCheckoutPanel.mjs';
const sha = 'a'.repeat(40);
const context = { environment: 'preview', branch: 'agent/archive-test-readonly-main-20261012', scope: 'archive-checkout-dry-run-v1', sha, deploymentId: 'dpl_fixture', url: 'synthetic-preview.vercel.app' };
const session = { user: { id: '4809ae25-4058-4e65-8c5b-136f82adee43', email: 'george@proto.co.za' }, access_token: 'private-token-sentinel', expires_at: Date.now() / 1000 + 3600 };
const options = { context, publicScope: context.scope, authUrl: 'https://kyodrsqnmihwoplkhwwf.supabase.co', hostname: context.url, sku: 'SYN-AR26-MAIN', qty: 1, getSession: () => session };
const env = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: context.branch, ARCHIVE_TEST_READ_ONLY: '1', ARCHIVE_TEST_CHECKOUT_SCOPE: context.scope, VITE_ARCHIVE_TEST_CHECKOUT_SCOPE: context.scope, ARCHIVE_CHECKOUT_AUTH_URL: options.authUrl, VITE_SUPABASE_URL: options.authUrl, ARCHIVE_TEST_STOCK_URL: 'https://aovcrilrgistrdcgtdgl.supabase.co', ARCHIVE_CHECKOUT_TEST_USER_ID: session.user.id, ARCHIVE_CHECKOUT_TEST_EMAIL: session.user.email, ARCHIVE_CHECKOUT_EXPECTED_COMMIT: sha, VERCEL_GIT_COMMIT_SHA: sha, VERCEL_URL: context.url, VERCEL_DEPLOYMENT_ID: context.deploymentId, VITE_SUPABASE_ANON_KEY: 'private-key-sentinel', ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY: 'private-key-sentinel' };
const goodBody = (patch = {}) => ({ ok: true, mode: 'validation-only', sku: options.sku, qty: 1, price: 115, unitsOfIssue: 'EACH', sourceCommit: sha, deploymentId: context.deploymentId, writesPerformed: false, ...patch });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('public context requires all existing server gates/proof and emits no credentials', () => {
  assert.deepEqual(archiveCheckoutPanelContext(env, context), context);
  assert.ok(!JSON.stringify(archiveCheckoutPanelContext(env, context)).includes('private-key-sentinel'));
  for (const key of Object.keys(env)) assert.equal(archiveCheckoutPanelContext({ ...env, [key]: '' }, context), null, key);
  for (const key of Object.keys(context)) assert.equal(archiveCheckoutPanelContext(env, { ...context, [key]: 'wrong' }), null, key);
  assert.equal(archiveCheckoutPanelContext({ ...env, VERCEL_ENV: 'production' }, context), null);
  assert.equal(archiveCheckoutPanelContext(env, null), null);
});
test('panel is closed on Production, local/other hosts, missing/mismatched scope or build identity', () => {
  assert.equal(panelAvailable(context, options.publicScope, options.authUrl, context.url), true);
  for (const patch of [{ context: null }, { context: { ...context, environment: 'production' } }, { context: { ...context, branch: 'main' } }, { context: { ...context, sha: '' } }, { context: { ...context, deploymentId: '' } }, { publicScope: '' }, { authUrl: 'https://other.supabase.co' }, { hostname: 'proto.co.za' }, { hostname: 'localhost' }, { hostname: 'other.vercel.app' }]) {
    const o = { ...options, ...patch };
    assert.equal(panelAvailable(o.context, o.publicScope, o.authUrl, o.hostname), false);
  }
});
test('only both synthetic SKUs and every integer 1–10 submit one exact request', async () => {
  for (const sku of ['SYN-AR26-MAIN', 'SYN-AR26-STORE']) for (let qty = 1; qty <= 10; qty++) {
    const calls = [];
    const result = await runFixtureValidation({ ...options, sku, qty, transport: async (url, init) => {
      calls.push({ url, init }); return response(goodBody({ sku, qty, secret: 'private-response-sentinel' }));
    } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/archive-checkout-dry-run');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.redirect, 'error');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer private-token-sentinel');
    assert.deepEqual(JSON.parse(calls[0].init.body), { sku, qty });
    assert.equal(result.ok, true); assert.equal(result.writesPerformed, false);
    assert.ok(!JSON.stringify(result).includes('private-'));
  }
});
test('invalid payload, account/session and unavailable panel never reach transport', async () => {
  for (const patch of [{ sku: 'REAL' }, { qty: 0 }, { qty: 11 }, { qty: 1.5 }, { qty: '1' }, { publicScope: '' }, { getSession: () => null }, { getSession: () => ({ ...session, user: { ...session.user, id: 'wrong' } }) }, { getSession: () => ({ ...session, user: { ...session.user, email: 'wrong' } }) }, { getSession: () => ({ ...session, access_token: '' }) }, { getSession: () => ({ ...session, expires_at: 0 }) }, { getSession: () => ({ ...session, expires_at: undefined }) }]) {
    let calls = 0;
    assert.equal((await runFixtureValidation({ ...options, ...patch, transport: () => { calls++; } })).ok, false);
    assert.equal(calls, 0);
  }
  assert.equal(sessionIssue(session), null);
});
test('401/profile/provenance errors remain safe with no auth retry or raw error text', async () => {
  for (const [status, code] of [[401, 'ARCHIVE_CHECKOUT_UNAUTHORIZED'], [403, 'ARCHIVE_CHECKOUT_PROFILE_REJECTED'], [409, 'ARCHIVE_CHECKOUT_PROVENANCE_REJECTED'], [503, 'private-response-sentinel']]) {
    let calls = 0;
    const result = await runFixtureValidation({ ...options, transport: async () => { calls++; return response({ ok: false, code, message: 'private-response-sentinel', writesPerformed: false }, status); } });
    assert.equal(calls, 1); assert.equal(result.ok, false); assert.equal(result.status, status);
    assert.equal(result.writesPerformed, false); assert.ok(!JSON.stringify(result).includes('private-'));
  }
});
test('malformed/foreign/wrong-source receipts cannot claim validation or no writes', async () => {
  for (const patch of [{ mode: 'order' }, { sku: 'REAL' }, { qty: 2 }, { sourceCommit: 'b'.repeat(40) }, { deploymentId: 'dpl_other' }, { writesPerformed: true }, { writesPerformed: undefined }, { price: 0 }]) {
    const result = await runFixtureValidation({ ...options, transport: async () => response(goodBody(patch)) });
    assert.equal(result.ok, false); assert.equal(result.writesPerformed, null);
  }
  for (const value of [new Response('private-invalid-json'), new Response(null, { status: 302 }), { ...response(goodBody()), redirected: true }, { ok: true, status: 200, url: 'https://other.vercel.app/api/archive-checkout-dry-run', json: async () => goodBody() }]) {
    assert.equal((await runFixtureValidation({ ...options, transport: async () => value })).ok, false);
  }
});
test('account/token change during request discards receipt without retries', async () => {
  for (const patch of [{ access_token: 'different-token' }, { user: { ...session.user, id: 'wrong' } }]) {
    let current = session;
    const result = await runFixtureValidation({ ...options, getSession: () => current, transport: async () => { current = { ...session, ...patch }; return response(goodBody()); } });
    assert.equal(result.code, 'SESSION_CHANGED'); assert.equal(result.writesPerformed, null);
  }
});
test('timeouts and cancellation make no retry or credential-bearing error disclosure', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  assert.equal((await runFixtureValidation({ ...options, signal: controller.signal, transport: () => { calls++; } })).code, 'VALIDATION_CANCELLED');
  assert.equal(calls, 0);
  const result = await runFixtureValidation({ ...options, timeoutMs: 5, transport: (url, init) => { calls++; return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('private-token-sentinel')))); } });
  assert.equal(calls, 1); assert.equal(result.code, 'VALIDATION_CANCELLED');
  assert.ok(!JSON.stringify(result).includes('private-'));
});
