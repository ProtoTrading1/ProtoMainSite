import test from 'node:test';
import assert from 'node:assert/strict';
import { browserCartStorage, validStoredCartItems, readStoredCart, archiveUnreadableCart } from '../src/lib/cartStorage.mjs';
import { readLegacyCartCopy, preserveLegacyCartCopy } from '../src/lib/legacyCartCopy.mjs';

function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const items = [{ product: { id: 'SYNTHETIC', code: 'SYNTHETIC', name: 'Synthetic product', price: 12 }, qty: 4, preference: 'Blue' }];

test('storage facade delays denied getter access until a catchable operation and never hides failed writes', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    get localStorage() { throw new Error('Synthetic storage getter denied'); },
  } });
  try {
    assert.equal(readLegacyCartCopy(browserCartStorage, 'a'), null);
    assert.throws(() => readStoredCart(browserCartStorage), /getter denied/);
    assert.throws(() => browserCartStorage.setItem('proto_cart', 'bytes'), /getter denied/);
    assert.throws(() => browserCartStorage.removeItem('proto_cart'), /getter denied/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
    else delete globalThis.window;
  }
});

test('valid basket reads preserve every product field and preference without modifying storage', () => {
  const store = storage();
  const raw = JSON.stringify(items);
  store.setItem('proto_cart', raw);
  assert.equal(validStoredCartItems([]), true);
  assert.equal(validStoredCartItems(items), true);
  assert.deepEqual(readStoredCart(store), { items, unreadableRaw: null });
  assert.equal(store.getItem('proto_cart'), raw);
});

test('malformed basket lines and rendered fields are rejected as a whole with their original bytes intact', () => {
  const store = storage();
  const corrupt = [[null], [items[0], null], [{ ...items[0], product: { id: 'SYNTHETIC', name: {} } }],
    [{ ...items[0], preference: {} }], [{ ...items[0], qty: 10000 }], [{ ...items[0], qty: 0 }],
    [{ ...items[0], qty: 1.5 }], [{ product: { name: 'No identity' }, qty: 1 }], Array(251).fill(items[0])];
  for (const candidate of corrupt) {
    const raw = JSON.stringify(candidate);
    store.setItem('proto_cart', raw);
    assert.equal(validStoredCartItems(candidate), false);
    assert.deepEqual(readStoredCart(store), { items: [], unreadableRaw: raw });
    assert.equal(store.getItem('proto_cart'), raw);
  }
  assert.equal(validStoredCartItems(Array(1)), false);
  store.setItem('proto_cart', '{broken');
  assert.deepEqual(readStoredCart(store), { items: [], unreadableRaw: '{broken' });
});

test('archive verifies exact raw bytes and retains original until the caller explicitly replaces it', () => {
  const store = storage();
  const raw = '[null]';
  store.setItem('proto_cart', raw);
  const archive = archiveUnreadableCart(store, 'proto_cart', raw);
  assert.equal(store.getItem(archive), raw);
  assert.equal(store.getItem('proto_cart'), raw);
  store.setItem('proto_cart', JSON.stringify(items));
  assert.equal(store.getItem(archive), raw);
});

test('changed original, quota failure and unconfirmed archive stop recovery without overwriting source bytes', () => {
  const store = storage();
  store.setItem('proto_cart', 'changed bytes');
  assert.throws(() => archiveUnreadableCart(store, 'proto_cart', '[null]'), { code: 'cart_device_storage' });
  assert.equal(store.values.size, 1);
  store.setItem('proto_cart', '[null]');
  store.setItem = () => { throw new Error('Synthetic quota'); };
  assert.throws(() => archiveUnreadableCart(store, 'proto_cart', '[null]'), { code: 'cart_device_storage' });
  assert.equal(store.getItem('proto_cart'), '[null]');
  store.setItem = () => {};
  assert.throws(() => archiveUnreadableCart(store, 'proto_cart', '[null]'), { code: 'cart_device_storage' });
  assert.equal(store.getItem('proto_cart'), '[null]');
});

test('malformed device-copy display data is archived before a usable copy is adopted', async () => {
  const store = storage();
  const key = 'proto_cart_device_copy_v1_a';
  const raw = JSON.stringify({ accountId: 'a', items: [{ ...items[0], product: { id: 'SYNTHETIC', name: {} } }] });
  store.setItem(key, raw);
  assert.equal(readLegacyCartCopy(store, 'a'), null);
  await preserveLegacyCartCopy(store, 'a', items, 1);
  assert.deepEqual(readLegacyCartCopy(store, 'a').items, items);
  assert.equal([...store.values.entries()].filter(([name, bytes]) => name.startsWith(`${key}_unreadable_`) && bytes === raw).length, 1);
});

test('source contradictions and oversized records remain unreadable evidence without replacement', () => {
  const store = storage();
  for (const product of [{ ...items[0].product, source: 'instore', isExtendedRange: false },
    { ...items[0].product, source: 'unknown' }, { ...items[0].product, isExtendedRange: 'true' }]) {
    const raw = JSON.stringify([{ ...items[0], product }]); store.setItem('proto_cart', raw);
    assert.deepEqual(readStoredCart(store), { items: [], unreadableRaw: raw });
    assert.equal(store.getItem('proto_cart'), raw);
  }
  const raw = JSON.stringify([{ ...items[0], product: { ...items[0].product, name: 'x'.repeat(2 * 1024 * 1024) } }]);
  store.setItem('proto_cart', raw);
  assert.deepEqual(readStoredCart(store), { items: [], unreadableRaw: raw });
});

test('same identity and quantity with changed source cannot replace a preserved device basket', async () => {
  const store = storage();
  const original = [{ ...items[0], product: { ...items[0].product, source: 'main', isExtendedRange: false } }];
  await preserveLegacyCartCopy(store, 'a', original, 1800000000000);
  const changed = [{ ...items[0], product: { ...items[0].product, source: 'instore', isExtendedRange: true } }];
  await assert.rejects(preserveLegacyCartCopy(store, 'a', changed, 1800000000001), { code: 'cart_device_storage' });
  assert.deepEqual(readLegacyCartCopy(store, 'a').items, original);
});
