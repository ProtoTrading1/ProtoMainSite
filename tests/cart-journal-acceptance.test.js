import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPendingCart, writePendingCart, clearPendingCart, encodePendingCart } from '../src/lib/cartSyncJournal.mjs';

const accountId = 'synthetic-journal-acceptance';
const journalKey = `proto_cart_pending_${accountId}`;
const activityAt = 1_800_000_000_000;
const operation = () => ({ type: 'save', intent: 'normal', activityAt,
  items: [{ product: { id: 'SYNTHETIC-PACK', name: 'Synthetic pack', price: 12.5,
    minQty: 6, unitsOfIssue: 'Pack of 12', isExtendedRange: true,
    images: ['synthetic-image.png'], availability: { state: 'in_stock' } },
  qty: 6, preference: ' Blue  only ' }] });

function storage() {
  const entries = new Map();
  return { getItem: k => entries.get(k) ?? null,
    setItem: (k, value) => entries.set(k, String(value)),
    removeItem: k => entries.delete(k) };
}

test('journal acknowledgement requires the exact durable record, retaining all metadata and preferences', () => {
  const store = storage();
  const original = operation();
  assert.equal(writePendingCart(store, accountId, original, 7), true);
  assert.equal(store.getItem(journalKey), encodePendingCart(accountId, original, 7));
  assert.deepEqual(readPendingCart(store, accountId), { accountId, ...original, baseRevision: 7 });
  const previous = store.getItem(journalKey);
  store.setItem = () => {};
  const changed = operation(); changed.items[0].qty = 9;
  assert.equal(writePendingCart(store, accountId, changed, 7), false);
  assert.equal(store.getItem(journalKey), previous);
});

test('silently discarded, changed, and unreadable writes never acknowledge persistence', () => {
  assert.equal(writePendingCart({ setItem() {}, getItem() { return null; } }, accountId, operation(), 1), false);
  assert.equal(writePendingCart({ setItem() {}, getItem() { return '{}'; } }, accountId, operation(), 1), false);
  assert.equal(writePendingCart({ setItem() {}, getItem() { throw new Error('Synthetic read denial'); } }, accountId, operation(), 1), false);
});

test('a remove that silently fails or cannot be checked is not a successful cleanup', () => {
  const store = storage();
  assert.equal(writePendingCart(store, accountId, operation(), 4), true);
  const previous = store.getItem(journalKey);
  store.removeItem = () => {};
  assert.equal(clearPendingCart(store, accountId), false);
  assert.equal(store.getItem(journalKey), previous);
  assert.equal(clearPendingCart({ removeItem() {}, getItem() { throw new Error('Synthetic read denial'); } }, accountId), false);
});

test('malformed journal lines and nonnullable fields fail closed without deleting the evidence', () => {
  const store = storage();
  const valid = { accountId, ...operation(), baseRevision: 4 };
  const malformed = [
    { items: [null] }, { items: [{}] }, { items: [{ product: null, qty: 1 }] },
    { items: [{ product: { id: 'SYNTHETIC' }, qty: '2' }] },
    { items: [{ product: { id: 'SYNTHETIC' }, qty: 0 }] },
    { items: [{ product: { id: {} }, qty: 2 }] },
    { items: [{ product: { id: 'SYNTHETIC', name: {} }, qty: 2 }] },
    { items: [{ product: { id: 'SYNTHETIC' }, qty: 2, preference: {} }] },
    { type: 'clear' }, { type: null }, { intent: null }, { intent: 'unknown' },
    { activityAt: null }, { activityAt: '1800000000000' }, { activityAt: 0 },
    { baseRevision: null }, { baseRevision: -1 }, { accountId: 'different-synthetic-account' },
  ];
  for (const invalid of malformed) {
    const raw = JSON.stringify({ ...valid, ...invalid });
    store.setItem(journalKey, raw);
    assert.equal(readPendingCart(store, accountId), null, raw);
    assert.equal(store.getItem(journalKey), raw, 'invalid evidence must remain untouched');
  }
});

test('invalid replacement cannot overwrite an existing valid pending intent', () => {
  const store = storage();
  assert.equal(writePendingCart(store, accountId, operation(), 8), true);
  const previous = store.getItem(journalKey);
  for (const invalid of [{ ...operation(), items: [null] }, { ...operation(), type: 'clear' },
    { ...operation(), activityAt: null }, { ...operation(), intent: null }]) {
    assert.equal(encodePendingCart(accountId, invalid, 8), null);
    assert.equal(writePendingCart(store, accountId, invalid, 8), false);
    assert.equal(store.getItem(journalKey), previous);
  }
});

test('valid empty clear round trips and verified removal remains scoped to its account', () => {
  const store = storage();
  const clear = { type: 'clear', activityAt, items: [], intent: 'submitted_clear' };
  assert.equal(writePendingCart(store, accountId, clear, 0), true);
  assert.deepEqual(readPendingCart(store, accountId), { accountId, ...clear, baseRevision: 0 });
  store.setItem('proto_cart_pending_other-synthetic', 'preserved');
  assert.equal(clearPendingCart(store, accountId), true);
  assert.equal(store.getItem(journalKey), null);
  assert.equal(store.getItem('proto_cart_pending_other-synthetic'), 'preserved');
});

test('cleanup of an older acknowledged snapshot preserves a newer journal', () => {
  const store = storage();
  assert.equal(writePendingCart(store, accountId, operation(), 7), true);
  const expectedRaw = store.getItem(journalKey);
  const newer = operation(); newer.items[0].qty = 9;
  assert.equal(writePendingCart(store, accountId, newer, 8), true);
  const newerRaw = store.getItem(journalKey);
  assert.equal(clearPendingCart(store, accountId, expectedRaw), false);
  assert.equal(store.getItem(journalKey), newerRaw);
  assert.equal(clearPendingCart(store, accountId, null), false);
  assert.equal(store.getItem(journalKey), newerRaw);
});

test('cleanup removes only its exact acknowledged snapshot, including expected absence', () => {
  const store = storage();
  assert.equal(writePendingCart(store, accountId, operation(), 7), true);
  assert.equal(clearPendingCart(store, accountId, store.getItem(journalKey)), true);
  assert.equal(store.getItem(journalKey), null);
  assert.equal(clearPendingCart(store, accountId, null), true);
  let attemptedRemove = false;
  assert.equal(clearPendingCart({ getItem: () => null,
    removeItem() { attemptedRemove = true; throw new Error('No removal required'); } }, accountId, 'old-acknowledged-snapshot'), true);
  assert.equal(attemptedRemove, false);
});
