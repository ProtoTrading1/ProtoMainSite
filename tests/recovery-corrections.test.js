import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPasswordSignIn } from '../src/lib/passwordSignIn.mjs';
import { preserveLegacyCartCopy, readLegacyCartCopy, discardLegacyCartCopy } from '../src/lib/legacyCartCopy.mjs';
import { clearRegistrationDraft, REGISTRATION_DRAFT_KEY } from '../src/lib/registrationDraft.mjs';

function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const items = [{ product: { id: 'SYNTHETIC', name: 'Synthetic product' }, qty: 4 }];

test('cancel during real SDK response processing never commits the shared session', async () => {
  let entered, release, commits = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const controller = new AbortController();
  const signIn = createPasswordSignIn({
    createProvisional: () => createClient('https://critical.example.invalid', 'synthetic-key', {
      global: { fetch: async () => {
        const response = new Response('{}');
        response.json = async () => {
          entered(); await gate;
          return { access_token: 'synthetic-only', refresh_token: 'synthetic-only', expires_in: 3600,
            user: { id: '00000000-0000-4000-8000-000000000211' } };
        };
        return response;
      } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    commitSession: async () => { commits += 1; return { data: {}, error: null }; },
  });
  const pending = signIn('critical@example.invalid', 'SyntheticCritical123!', { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(commits, 0);
});

test('successful provisional login marks the commit point and propagates commit failure', async () => {
  const sequence = [];
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = [encode({ alg: 'none' }), encode({ exp: Math.floor(Date.now() / 1000) + 3600 }), encode('synthetic')].join('.');
  const signIn = createPasswordSignIn({
    createProvisional: () => ({ auth: {
      signInWithPassword: async () => ({ data: { session: { access_token: token } }, error: null }),
      stopAutoRefresh: async () => { sequence.push('cleanup'); },
    } }),
    commitSession: async () => { sequence.push('commit'); return { error: new Error('Synthetic commit failure') }; },
  });
  await assert.rejects(signIn('critical@example.invalid', 'SyntheticOnly', { onCommit: () => sequence.push('mark') }), /Synthetic commit failure/);
  assert.deepEqual(sequence, ['mark', 'commit', 'cleanup']);
});

test('stale copy discard preserves a newer version and account basket storage', async () => {
  const store = storage();
  const original = await preserveLegacyCartCopy(store, 'a', items, 1);
  const changed = { ...original, items: [{ ...items[0], qty: 99 }], savedAt: original.savedAt + 1 };
  store.setItem('proto_cart_device_copy_v1_a', JSON.stringify(changed));
  store.setItem('proto_cart', 'current canonical basket');
  assert.equal(await discardLegacyCartCopy(store, 'a', original), false);
  assert.deepEqual(readLegacyCartCopy(store, 'a'), changed);
  assert.equal(store.getItem('proto_cart'), 'current canonical basket');
});

test('corrupt bytes are retained before the valid device copy is stored', async () => {
  const store = storage();
  store.setItem('proto_cart_device_copy_v1_a', '{broken');
  await preserveLegacyCartCopy(store, 'a', items, 1);
  assert.deepEqual(readLegacyCartCopy(store, 'a').items, items);
  assert.equal([...store.values.entries()].filter(([key, value]) => key.includes('_unreadable_') && value === '{broken').length, 1);
});

test('failed corrupt-copy archive leaves both original and canonical bytes untouched', async () => {
  const store = storage();
  store.setItem('proto_cart_device_copy_v1_a', '{broken');
  store.setItem('proto_cart', 'canonical basket');
  store.setItem = () => { throw new Error('Synthetic quota failure'); };
  await assert.rejects(preserveLegacyCartCopy(store, 'a', items, 1), { code: 'cart_device_storage' });
  assert.equal(store.getItem('proto_cart_device_copy_v1_a'), '{broken');
  assert.equal(store.getItem('proto_cart'), 'canonical basket');
});

test('draft deletion verifies storage instead of claiming success on failure', () => {
  const store = storage();
  store.setItem(REGISTRATION_DRAFT_KEY, 'synthetic details');
  store.removeItem = () => {};
  assert.equal(clearRegistrationDraft(store), false);
  store.removeItem = () => { throw new Error('Synthetic storage failure'); };
  assert.equal(clearRegistrationDraft(store), false);
});

test('queued copy discard rechecks account eligibility inside the acquired lock', async () => {
  const store = storage();
  const copy = await preserveLegacyCartCopy(store, 'a', items, 1);
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let eligible = true;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: { request: async (_name, operation) => { await gate; return operation(); } },
  } });
  try {
    const pending = discardLegacyCartCopy(store, 'a', copy, () => eligible);
    eligible = false;
    release();
    assert.equal(await pending, false);
    assert.deepEqual(readLegacyCartCopy(store, 'a'), copy);
    eligible = true;
    assert.equal(await discardLegacyCartCopy(store, 'a', copy, () => eligible), true);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete globalThis.window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test('cancelled hydration cannot create a device copy after its queued preservation lock opens', async () => {
  const store = storage();
  store.setItem('proto_cart', 'untouched canonical basket');
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let active = true;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    locks: { request: async (_name, operation) => { await gate; return operation(); } },
  } });
  try {
    const pending = preserveLegacyCartCopy(store, 'a', items, 1, () => active);
    active = false;
    release();
    assert.equal(await pending, null);
    assert.equal(readLegacyCartCopy(store, 'a'), null);
    assert.equal(store.getItem('proto_cart'), 'untouched canonical basket');
    active = true;
    assert.deepEqual((await preserveLegacyCartCopy(store, 'a', items, 1, () => active)).items, items);
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete globalThis.window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else delete globalThis.navigator;
  }
});

test('draft cleanup can be retried after a denied removal without altering details', () => {
  const store = storage();
  const originalRemove = store.removeItem;
  store.setItem(REGISTRATION_DRAFT_KEY, 'synthetic details');
  store.removeItem = () => { throw new Error('Synthetic denied removal'); };
  assert.equal(clearRegistrationDraft(store), false);
  assert.equal(store.getItem(REGISTRATION_DRAFT_KEY), 'synthetic details');
  store.removeItem = originalRemove;
  assert.equal(clearRegistrationDraft(store), true);
  assert.equal(store.getItem(REGISTRATION_DRAFT_KEY), null);
});
