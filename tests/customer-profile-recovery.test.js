import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { loadCustomerProfile } from '../src/lib/customerProfileClient.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const api = read('api/customer-profile.js');
const authClient = read('src/lib/auth.js');
const root = read('src/Root.jsx');

test('customer profile reads carry the authenticated caller through Supabase RLS', () => {
  assert.match(api, /function getAuthenticatedClient\(req\)/);
  assert.match(api, /process\.env\.VITE_SUPABASE_ANON_KEY/);
  assert.match(api, /global:\s*\{ headers:\s*\{ Authorization: req\.headers\.authorization \} \}/);
  assert.match(api, /const supabase = getAuthenticatedClient\(req\);/);
  assert.doesNotMatch(api, /getAdminClient/);
  assert.doesNotMatch(api, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

test('profile API distinguishes missing profiles from temporary lookup failures', () => {
  assert.match(api, /status\(503\)[\s\S]*CUSTOMER_PROFILE_LOOKUP_FAILED/);
  assert.match(api, /status\(404\)[\s\S]*CUSTOMER_PROFILE_NOT_FOUND/);
  assert.doesNotMatch(api, /status\(200\)\.json\(\{ profile: null \}\)/);
});

test('profile client preserves server and timeout errors instead of returning null', () => {
  const helper = authClient.slice(
    authClient.indexOf('export async function getCustomerProfile'),
    authClient.indexOf('// Update WhatsApp opt-in'),
  );
  assert.match(helper, /loadCustomerProfile\(userId/);
  const bounded = read('src/lib/customerProfileClient.mjs');
  assert.match(bounded, /requestJson\(/);
  assert.match(bounded, /CUSTOMER_PROFILE_TIMEOUT/);
  assert.doesNotMatch(helper, /return null/);
});

test('bounded profile client retains actual HTTP status and server code', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Profile missing', code: 'CUSTOMER_PROFILE_NOT_FOUND' }), { status: 404 }));
  await assert.rejects(loadCustomerProfile('synthetic-id', { headers: { Authorization: 'Bearer synthetic' } }), error => error.status === 404 && error.code === 'CUSTOMER_PROFILE_NOT_FOUND');
});

test('profile deadline covers stalled token headers and stalled response bodies', async (t) => {
  await assert.rejects(loadCustomerProfile('synthetic-id', { headers: () => new Promise(() => {}), timeoutMs: 10 }), error => error.code === 'CUSTOMER_PROFILE_TIMEOUT');
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: () => new Promise(() => {}) }));
  await assert.rejects(loadCustomerProfile('synthetic-id', { timeoutMs: 10 }), error => error.code === 'CUSTOMER_PROFILE_TIMEOUT');
});

test('signed-in customers receive a visible retry path when profile loading fails', () => {
  assert.match(root, /const \[customerLoadError, setCustomerLoadError\]/);
  assert.match(root, /We couldn’t open your dashboard/);
  assert.match(root, /You are signed in/);
  assert.match(root, /onClick=\{\(\) => loadCustomer\(session\.user\.id, session\)\}/);
  assert.match(root, /if \(customerRecovery\) return customerRecovery;/);
});
