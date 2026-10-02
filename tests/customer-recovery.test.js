import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedRequest } from '../src/lib/boundedRequest.mjs';
import { createLoginTransport } from '../src/lib/loginTransport.mjs';
import { preserveLegacyCartCopy, readLegacyCartCopy, discardLegacyCartCopy } from '../src/lib/legacyCartCopy.mjs';
import { REGISTRATION_DRAFT_KEY, saveRegistrationDraft, readRegistrationDraft } from '../src/lib/registrationDraft.mjs';

function storage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}
const items = [{ product: { id: 'SAFE', code: 'SAFE', name: 'Synthetic item' }, qty: 9, preference: 'green' }];

test('deadline bounds response consumption and ignores late results', async () => {
  let release;
  let signal;
  const pending = boundedRequest((s) => { signal = s; return new Promise((r) => { release = r; }); }, { timeoutMs: 5 });
  await assert.rejects(pending, /timed out/);
  assert.equal(signal.aborted, true);
  release('late success');
  await assert.rejects(pending, /timed out/);
});

test('cancel bounds even a transport which ignores abort', async () => {
  const controller = new AbortController();
  const pending = boundedRequest(() => new Promise(() => {}), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('password transport consumes the entire body before the SDK can persist success', async () => {
  const controller = new AbortController();
  let bodyStarted;
  const started = new Promise((r) => { bodyStarted = r; });
  const transport = createLoginTransport(async () => ({ arrayBuffer: () => { bodyStarted(); return new Promise(() => {}); } }));
  let persisted = false;
  const pending = transport.run(async () => {
    await transport.fetch('https://example.invalid/auth/v1/token?grant_type=password');
    persisted = true;
  }, controller.signal);
  await started;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(persisted, false);
});

test('password transport leaves non-password Supabase requests unchanged', async () => {
  const response = new Response('unchanged');
  const transport = createLoginTransport(async () => response);
  assert.equal(await transport.fetch('https://example.invalid/auth/v1/token?grant_type=refresh_token'), response);
});

test('legacy copy preserves quantities/preferences across reload and account isolation', () => {
  const store = storage();
  const copy = preserveLegacyCartCopy(store, 'account-a', items, 123);
  assert.deepEqual(readLegacyCartCopy(store, 'account-a'), copy);
  assert.equal(readLegacyCartCopy(store, 'account-b'), null);
  assert.throws(() => preserveLegacyCartCopy(store, 'account-a', [{ ...items[0], qty: 1 }], 456), { code: 'cart_device_storage' });
  assert.deepEqual(readLegacyCartCopy(store, 'account-a').items, items);
  store.setItem('proto_cart', 'current-account-copy');
  assert.equal(discardLegacyCartCopy(store, 'account-a'), true);
  assert.equal(store.getItem('proto_cart'), 'current-account-copy');
});

test('failed device storage prevents basket adoption', () => {
  const store = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.throws(() => preserveLegacyCartCopy(store, 'account-a', items, 123), { code: 'cart_device_storage' });
});

test('registration draft only stores permitted nonsecret fields and expires after 24 hours', () => {
  const store = storage();
  assert.equal(saveRegistrationDraft(store, { companyName: 'Synthetic Co', email: 'safe@example.invalid', password: 'MUST_NOT_STORE', confirmPassword: 'MUST_NOT_STORE', access_token: 'MUST_NOT_STORE', step: 3, phone: '0821234567' }, 100), true);
  const encoded = store.getItem(REGISTRATION_DRAFT_KEY);
  assert.doesNotMatch(encoded, /MUST_NOT_STORE|password|access_token/i);
  assert.equal(readRegistrationDraft(store, 200).companyName, 'Synthetic Co');
  assert.equal(readRegistrationDraft(store, 24 * 60 * 60 * 1000 + 101), null);
  assert.equal(store.getItem(REGISTRATION_DRAFT_KEY), null);
});
