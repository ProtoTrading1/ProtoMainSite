import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  readPendingCart,
  writePendingCart,
  clearPendingCart,
} from '../src/lib/cartSyncJournal.mjs';

function memoryStorage() {
  const entries = new Map();
  return {
    getItem(key) { return entries.get(key) ?? null; },
    setItem(key, value) { entries.set(key, String(value)); },
    removeItem(key) { entries.delete(key); },
  };
}

const accountA = 'synthetic-account-a';
const accountB = 'synthetic-account-b';
const key = (accountId) => `proto_cart_pending_${accountId}`;
const activityAt = 1_800_000_000_000;

function saveOperation() {
  return {
    accountId: accountA,
    items: [
      { product: { id: 'SYNTHETIC-SKU', price: 12.5 }, qty: 15, preference: 'Green' },
      { product: { id: 'SYNTHETIC-SKU', price: 12.5 }, qty: 3, preference: ' Dark blue ' },
    ],
    activityAt,
    type: 'save',
    intent: 'restore',
  };
}

test('pending save survives a storage round trip with quantities, preferences and base revision intact', () => {
  const storage = memoryStorage();
  const operation = saveOperation();
  assert.equal(writePendingCart(storage, accountA, operation, 7), true);
  const expected = { ...operation, baseRevision: 7 };
  assert.deepEqual(JSON.parse(storage.getItem(key(accountA))), expected);
  assert.deepEqual(readPendingCart(storage, accountA), expected);
  assert.deepEqual(readPendingCart(storage, accountA).items.map(({ qty, preference }) => (
    { qty, preference }
  )), [{ qty: 15, preference: 'Green' }, { qty: 3, preference: ' Dark blue ' }]);
});

test('reads are scoped to the requested account and reject an account-mismatched stored record', () => {
  const storage = memoryStorage();
  assert.equal(writePendingCart(storage, accountA, saveOperation(), 7), true);
  assert.equal(readPendingCart(storage, accountB), null);
  storage.setItem(key(accountB), storage.getItem(key(accountA)));
  assert.equal(readPendingCart(storage, accountB), null);
  assert.equal(readPendingCart(storage, accountA).accountId, accountA);
});

test('a pending clear preserves its timestamp, base revision and submitted-clear intent', () => {
  const storage = memoryStorage();
  const operation = {
    accountId: accountA,
    items: [],
    activityAt,
    type: 'clear',
    intent: 'submitted_clear',
  };
  assert.equal(writePendingCart(storage, accountA, operation, 0), true);
  assert.deepEqual(readPendingCart(storage, accountA), { ...operation, baseRevision: 0 });
});

test('missing, corrupt and structurally incomplete journals read as null without destroying their raw copy', () => {
  const storage = memoryStorage();
  assert.equal(readPendingCart(storage, accountA), null);
  for (const raw of ['{broken', 'null', '[]', '{}', JSON.stringify({ accountId: accountA })]) {
    storage.setItem(key(accountA), raw);
    assert.equal(readPendingCart(storage, accountA), null, raw);
    assert.equal(storage.getItem(key(accountA)), raw);
  }
});

test('storage read errors return null and write errors return false', () => {
  const unavailable = {
    getItem() { throw new Error('Synthetic storage unavailable'); },
    setItem() { throw new Error('Synthetic storage full'); },
  };
  assert.equal(readPendingCart(unavailable, accountA), null);
  assert.equal(writePendingCart(unavailable, accountA, saveOperation(), 7), false);
  assert.equal(readPendingCart(null, accountA), null);
  assert.equal(writePendingCart(null, accountA, saveOperation(), 7), false);
});

test('clear removes only the requested account journal and leaves other storage untouched', () => {
  const storage = memoryStorage();
  assert.equal(writePendingCart(storage, accountA, saveOperation(), 7), true);
  assert.equal(writePendingCart(storage, accountB, { ...saveOperation(), accountId: accountB }, 9), true);
  storage.setItem('proto_cart', 'synthetic-device-basket');
  const otherAccountBefore = storage.getItem(key(accountB));
  clearPendingCart(storage, accountA);
  assert.equal(storage.getItem(key(accountA)), null);
  assert.equal(readPendingCart(storage, accountA), null);
  assert.equal(storage.getItem(key(accountB)), otherAccountBefore);
  assert.equal(readPendingCart(storage, accountB).baseRevision, 9);
  assert.equal(storage.getItem('proto_cart'), 'synthetic-device-basket');
  clearPendingCart(storage, accountA);
  assert.equal(storage.getItem(key(accountB)), otherAccountBefore);
});
