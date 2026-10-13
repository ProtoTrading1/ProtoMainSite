import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveTestRequestBlock } from '../api/_archive-test-client.js';
import { readOnlyBrowserFetch } from '../src/lib/archive-test-browser-fetch.mjs';
import { ARCHIVE_CHECKOUT_PATH, ARCHIVE_CHECKOUT_SCOPE, ARCHIVE_CHECKOUT_BRANCH, ARCHIVE_CHECKOUT_PORTAL, ARCHIVE_CHECKOUT_STOCK, ARCHIVE_CHECKOUT_OWNER, ARCHIVE_CHECKOUT_EMAIL } from '../api/_archive-checkout-config.js';
const sha = 'a'.repeat(40);
const env = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: ARCHIVE_CHECKOUT_BRANCH, ARCHIVE_TEST_READ_ONLY: '1', ARCHIVE_TEST_STOCK_URL: ARCHIVE_CHECKOUT_STOCK, ARCHIVE_TEST_STOCK_SERVICE_ROLE_KEY: 'synthetic-only', ARCHIVE_TEST_CHECKOUT_SCOPE: ARCHIVE_CHECKOUT_SCOPE, VITE_ARCHIVE_TEST_CHECKOUT_SCOPE: ARCHIVE_CHECKOUT_SCOPE, ARCHIVE_CHECKOUT_AUTH_URL: ARCHIVE_CHECKOUT_PORTAL, VITE_SUPABASE_URL: ARCHIVE_CHECKOUT_PORTAL, VITE_SUPABASE_ANON_KEY: 'synthetic-public', ARCHIVE_CHECKOUT_TEST_USER_ID: ARCHIVE_CHECKOUT_OWNER, ARCHIVE_CHECKOUT_TEST_EMAIL: ARCHIVE_CHECKOUT_EMAIL, ARCHIVE_CHECKOUT_EXPECTED_COMMIT: sha, VERCEL_GIT_COMMIT_SHA: sha, VERCEL_URL: 'synthetic-preview.vercel.app', VERCEL_DEPLOYMENT_ID: 'dpl_synthetic' };
const proof = { sha, branch: ARCHIVE_CHECKOUT_BRANCH, environment: 'preview', url: env.VERCEL_URL, deploymentId: env.VERCEL_DEPLOYMENT_ID, scope: ARCHIVE_CHECKOUT_SCOPE };
test('middleware permits only exact scoped POST with proof and preserves other write guards', () => {
  const request = (path, method = 'POST') => new Request('https://synthetic-preview.vercel.app' + path, { method });
  assert.equal(archiveTestRequestBlock(request(ARCHIVE_CHECKOUT_PATH), env, proof), null);
  assert.equal(archiveTestRequestBlock(request(ARCHIVE_CHECKOUT_PATH), env).status, 503);
  for (const path of [ARCHIVE_CHECKOUT_PATH + '?', ARCHIVE_CHECKOUT_PATH + '?x=1', ARCHIVE_CHECKOUT_PATH + '/', '/api/send-order', '/api/customer-profile']) assert.ok(archiveTestRequestBlock(request(path), env, proof));
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.ok(archiveTestRequestBlock(request(ARCHIVE_CHECKOUT_PATH, method), env, proof));
  for (const key of Object.keys(env)) assert.ok(archiveTestRequestBlock(request(ARCHIVE_CHECKOUT_PATH), { ...env, [key]: '' }, proof), key);
  assert.equal(archiveTestRequestBlock(request('/api/products', 'GET'), env, proof), null);
});
test('browser transport permits precise opt-in dry-run while denying writes and query variants', async () => {
  const calls = [];
  const options = { origin: 'https://synthetic-preview.vercel.app', authOrigin: ARCHIVE_CHECKOUT_PORTAL, checkoutScope: ARCHIVE_CHECKOUT_SCOPE };
  const transport = async (input, init) => { calls.push({ input, init }); return new Response('{}'); };
  const fetch = readOnlyBrowserFetch(transport, options);
  await fetch(ARCHIVE_CHECKOUT_PATH, { method: 'POST' });
  assert.equal(calls.length, 1); assert.equal(calls[0].init.redirect, 'error');
  for (const path of [ARCHIVE_CHECKOUT_PATH + '?', ARCHIVE_CHECKOUT_PATH + '?x=1', ARCHIVE_CHECKOUT_PATH + '/', '/api/send-order', ARCHIVE_CHECKOUT_PORTAL + '/rest/v1/customers']) await assert.rejects(fetch(path, { method: 'POST' }));
  for (const patch of [{ checkoutScope: undefined }, { checkoutScope: 'other' }, { authOrigin: 'https://other.supabase.co' }]) await assert.rejects(readOnlyBrowserFetch(transport, { ...options, ...patch })(ARCHIVE_CHECKOUT_PATH, { method: 'POST' }));
  assert.equal(calls.length, 1);
});
