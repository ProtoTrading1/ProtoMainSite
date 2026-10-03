import assert from 'node:assert/strict';
import test from 'node:test';
import { writePendingCart, clearPendingCart, encodePendingCart, writeRecoverablePendingCart,
  readPendingCartRecoveryCopies, acknowledgePendingCartRecoveryCopies,
  MAX_PENDING_CART_RECOVERY_COPIES, retireSupersededPendingCartRecoveryCopy } from '../src/lib/cartSyncJournal.mjs';

const account = 'synthetic-recovery-account';
const pending = `proto_cart_pending_${account}`;
const operation = qty => ({ type: 'save', intent: 'normal', activityAt: 1800000000000 + qty,
  items: [{ product: { id: 'SYNTHETIC', name: 'Synthetic pack', minQty: 1, unitsOfIssue: 'PACK 12' }, qty, preference: 'Blue' }] });
function memoryStorage() {
  const entries = new Map();
  return { entries, get length() { return entries.size; }, key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
}

test('both modern operations survive an older-client shared-slot overwrite and exact acknowledgement', () => {
  const storage = memoryStorage();
  const first = writeRecoverablePendingCart(storage, account, operation(1), 7);
  const second = writeRecoverablePendingCart(storage, account, operation(2), 7);
  assert.equal(first.kept, true); assert.equal(second.kept, true);
  assert.notEqual(first.copyKey, second.copyKey);
  assert.equal(writePendingCart(storage, account, operation(3), 7), true);
  assert.deepEqual(readPendingCartRecoveryCopies(storage, account).map(copy => copy.raw).sort(), [first.raw, second.raw].sort());
  assert.equal(acknowledgePendingCartRecoveryCopies(storage, account, first.raw), true);
  assert.deepEqual(readPendingCartRecoveryCopies(storage, account).map(copy => copy.raw), [second.raw]);
  assert.equal(JSON.parse(storage.getItem(pending)).items[0].qty, 3);
});

test('newer immutable evidence survives non-atomic observed compare-and-remove', () => {
  const storage = memoryStorage();
  const first = writeRecoverablePendingCart(storage, account, operation(1), 7);
  const get = storage.getItem;
  let newer;
  storage.getItem = key => {
    const value = get(key);
    if (key === pending && !newer) {
      storage.getItem = get;
      newer = writeRecoverablePendingCart(storage, account, operation(2), 7);
    }
    return value;
  };
  assert.equal(clearPendingCart(storage, account, first.raw), true);
  assert.equal(storage.getItem(pending), null);
  assert.equal(newer.kept, true);
  assert.equal(storage.getItem(newer.copyKey), newer.raw);
  assert.equal(readPendingCartRecoveryCopies(storage, account).length, 2);
});

test('retries reuse exact bytes, and recovery cap refuses publication without evicting evidence', () => {
  const storage = memoryStorage();
  const first = writeRecoverablePendingCart(storage, account, operation(1), 7);
  const retry = writeRecoverablePendingCart(storage, account, operation(1), 7);
  assert.equal(retry.copyKey, first.copyKey);
  for (let qty = 2; qty <= MAX_PENDING_CART_RECOVERY_COPIES; qty++) {
    assert.equal(writeRecoverablePendingCart(storage, account, operation(qty), 7).kept, true);
  }
  const before = new Map(storage.entries);
  assert.equal(writeRecoverablePendingCart(storage, account, operation(21), 7).kept, false);
  assert.deepEqual(storage.entries, before);
  assert.equal(readPendingCartRecoveryCopies(storage, account).length, MAX_PENDING_CART_RECOVERY_COPIES);
});

test('backup verification precedes shared publication; denied and silently lost copies fail closed', () => {
  for (const mode of ['throw', 'silent']) {
    const storage = memoryStorage();
    const set = storage.setItem;
    storage.setItem = (key, raw) => {
      if (key.startsWith('proto_cart_recovery:')) {
        if (mode === 'throw') throw new Error('Synthetic quota');
        return;
      }
      set(key, raw);
    };
    assert.equal(writeRecoverablePendingCart(storage, account, operation(1), 7).kept, false);
    assert.equal(storage.getItem(pending), null);
  }
  assert.equal(writeRecoverablePendingCart({ getItem() {}, setItem() {} }, account, operation(1), 7).kept, false);
});

test('shared publication failure retains the already verified recovery copy', () => {
  const storage = memoryStorage();
  const set = storage.setItem;
  storage.setItem = (key, raw) => { if (key === pending) throw new Error('Synthetic shared-slot denial'); set(key, raw); };
  assert.equal(writeRecoverablePendingCart(storage, account, operation(2), 7).kept, false);
  const copies = readPendingCartRecoveryCopies(storage, account);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].raw, encodePendingCart(account, operation(2), 7));
});

test('recovery evidence is account-scoped; corrupt entries remain untouched and count toward cap', () => {
  const storage = memoryStorage();
  const own = writeRecoverablePendingCart(storage, account, operation(1), 7);
  const other = writeRecoverablePendingCart(storage, 'other-account', operation(2), 7);
  storage.setItem(`proto_cart_recovery:${encodeURIComponent(account)}:corrupt`, '{broken');
  const copies = readPendingCartRecoveryCopies(storage, account);
  assert.equal(copies.length, 2); assert.ok(copies.some(copy => copy.draft === null));
  assert.equal(acknowledgePendingCartRecoveryCopies(storage, account, own.raw), true);
  assert.equal(storage.getItem(other.copyKey), other.raw);
  assert.equal(storage.getItem(`proto_cart_recovery:${encodeURIComponent(account)}:corrupt`), '{broken');
  assert.equal(acknowledgePendingCartRecoveryCopies(storage, account, other.raw), false);
});

test('copy cleanup never acknowledges silent removal failure or unavailable storage', () => {
  const storage = memoryStorage();
  const copy = writeRecoverablePendingCart(storage, account, operation(1), 7);
  storage.removeItem = () => {};
  assert.equal(acknowledgePendingCartRecoveryCopies(storage, account, copy.raw), false);
  assert.equal(storage.getItem(copy.copyKey), copy.raw);
  assert.throws(() => readPendingCartRecoveryCopies(null, account), { code: 'cart_device_storage' });
});

test('verified successor retires only the exact owned prior slot, preserving foreign identical bytes', () => {
  const storage = memoryStorage();
  const first = writeRecoverablePendingCart(storage, account, operation(1), 7);
  const foreignKey = `proto_cart_recovery:${encodeURIComponent(account)}:foreign-identical-copy`;
  storage.setItem(foreignKey, first.raw);
  const successor = writeRecoverablePendingCart(storage, account, operation(2), 7);
  assert.equal(retireSupersededPendingCartRecoveryCopy(storage, account, foreignKey, first.raw, successor), false);
  assert.equal(retireSupersededPendingCartRecoveryCopy(storage, account, first.copyKey, first.raw, successor), true);
  assert.equal(storage.getItem(first.copyKey), null);
  assert.equal(storage.getItem(foreignKey), first.raw);
  assert.equal(storage.getItem(successor.copyKey), successor.raw);
});

test('foreign same-raw copy is never reused as this-tab ownership', () => {
  const storage = memoryStorage();
  const raw = encodePendingCart(account, operation(1), 7);
  const foreignKey = `proto_cart_recovery:${encodeURIComponent(account)}:foreign`;
  storage.setItem(foreignKey, raw);
  const own = writeRecoverablePendingCart(storage, account, operation(1), 7);
  assert.equal(own.kept, true);
  assert.notEqual(own.copyKey, foreignKey);
  assert.equal(storage.getItem(foreignKey), raw);
});

test('unverified or overwritten successor cannot retire the owned prior recovery copy', () => {
  const storage = memoryStorage();
  const prior = writeRecoverablePendingCart(storage, account, operation(1), 7);
  const successor = writeRecoverablePendingCart(storage, account, operation(2), 7);
  assert.equal(retireSupersededPendingCartRecoveryCopy(storage, account, prior.copyKey, prior.raw, { ...successor, kept: false }), false);
  storage.setItem(pending, encodePendingCart(account, operation(3), 7));
  assert.equal(retireSupersededPendingCartRecoveryCopy(storage, account, prior.copyKey, prior.raw, successor), false);
  assert.equal(storage.getItem(prior.copyKey), prior.raw);
  assert.equal(storage.getItem(successor.copyKey), successor.raw);
});

test('malformed shared journal is preserved and blocks replacement even with a verified new draft', () => {
  const store = memoryStorage();
  store.setItem(pending, '{broken shared evidence');
  assert.equal(writePendingCart(store, account, operation(1), 7), false);
  assert.equal(writeRecoverablePendingCart(store, account, operation(1), 7).kept, false);
  assert.equal(store.getItem(pending), '{broken shared evidence');
  assert.equal(readPendingCartRecoveryCopies(store, account).length, 0);
});

test('journal byte cap refuses oversized drafts and preserves oversized persisted source', () => {
  const store = memoryStorage(), huge = operation(1);
  huge.items[0].product.name = 'x'.repeat(2 * 1024 * 1024);
  assert.equal(encodePendingCart(account, huge, 7), null);
  assert.equal(writePendingCart(store, account, huge, 7), false);
  assert.equal(writeRecoverablePendingCart(store, account, huge, 7).kept, false);
  const raw = JSON.stringify({ accountId: account, ...huge, baseRevision: 7 });
  store.setItem(pending, raw);
  assert.equal(writeRecoverablePendingCart(store, account, operation(2), 7).kept, false);
  assert.equal(store.getItem(pending), raw);
  assert.equal(acknowledgePendingCartRecoveryCopies(store, account, raw), false);
});
