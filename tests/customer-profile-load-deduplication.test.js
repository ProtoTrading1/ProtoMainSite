import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createProfileRequestCache } from '../src/lib/profileRequestCache.js';

const root = fs.readFileSync(new URL('../src/Root.jsx', import.meta.url), 'utf8');

const loadCustomer = root.slice(
  root.indexOf('const loadCustomer = useCallback'),
  root.indexOf('\n  useEffect(() => {', root.indexOf('const loadCustomer = useCallback')),
);

test('profile loading shares one real request for concurrent observations of the same session', async () => {
  const cache = createProfileRequestCache();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const request = () => {
    calls += 1;
    return pending;
  };

  const first = cache.load({ userId: 'customer-1', accessToken: 'token-1', request });
  const duplicate = cache.load({ userId: 'customer-1', accessToken: 'token-1', request });
  assert.strictEqual(first, duplicate);
  await Promise.resolve();
  assert.equal(calls, 1);

  release({ id: 'customer-1' });
  assert.deepEqual(await first, { id: 'customer-1' });
  assert.deepEqual(await duplicate, { id: 'customer-1' });
});

test('successful profiles are reused while failures remain retryable', async () => {
  const cache = createProfileRequestCache();
  let successfulCalls = 0;
  const request = async () => ({ id: `customer-${++successfulCalls}` });

  assert.deepEqual(await cache.load({ userId: 'customer-1', accessToken: 'token-1', request }), { id: 'customer-1' });
  assert.deepEqual(await cache.load({ userId: 'customer-1', accessToken: 'token-1', request }), { id: 'customer-1' });
  assert.equal(successfulCalls, 1);

  let failedCalls = 0;
  const failingCache = createProfileRequestCache();
  const failingRequest = async () => {
    failedCalls += 1;
    throw new Error('temporary');
  };
  await assert.rejects(failingCache.load({ userId: 'customer-1', accessToken: 'token-1', request: failingRequest }));
  await assert.rejects(failingCache.load({ userId: 'customer-1', accessToken: 'token-1', request: failingRequest }));
  assert.equal(failedCalls, 2);
});

test('token refreshes and logout cannot reuse a stale profile', async () => {
  const cache = createProfileRequestCache();
  let calls = 0;
  const request = async () => ({ version: ++calls });

  assert.deepEqual(await cache.load({ userId: 'customer-1', accessToken: 'token-1', request }), { version: 1 });
  assert.deepEqual(await cache.load({ userId: 'customer-1', accessToken: 'token-2', request }), { version: 2 });
  cache.clear();
  assert.deepEqual(await cache.load({ userId: 'customer-1', accessToken: 'token-2', request }), { version: 3 });
});

test('existing profile-load side effects remain in the shared request', () => {
  assert.match(root, /customerLoadRequest = useRef\(createProfileRequestCache\(\)\)/);
  assert.match(loadCustomer, /customerLoadRequest\.current\.load\(/);
  assert.match(loadCustomer, /setMonitoringUser\(profile\)/);
  assert.match(loadCustomer, /if \(adminHost\)/);
  assert.match(loadCustomer, /if \(preRegisterHost\)/);
  assert.match(loadCustomer, /setCustomerLoadError\(/);
  assert.match(root, /refreshIntercomIdentity\(sess\)/);
  assert.match(root, /identifyIntercom\(sess\)/);
  assert.match(root, /loadNonce\.current \+= 1;\s*customerLoadRequest\.current\.clear\(\);\s*setSession\(null\)/);
});
