import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSavedCheckout } from '../src/lib/checkoutRecoveryClient.mjs';
import { writePendingCheckout, readPendingCheckout } from '../src/lib/pendingCheckout.mjs';
import { basketLineKey } from '../lib/basket-lines.mjs';

function fixture() {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const items = [{ qty: 2, product: { id: 'SKU', sku: 'SKU', code: '123', source: 'main', isExtendedRange: false, price: 10 } }];
  const payload = { clientRef: 'original-reference', items: [{ qty: 2, product: { id: 'SKU', sku: 'SKU', code: '123', source: 'main', isExtendedRange: false, checkoutSnapshot: { unitPrice: 10, stockQty: 3 } } }], deliveryMethod: 'In store pick up', customerNotes: '', promoCode: null };
  const pending = writePendingCheckout(storage, 'buyer', { version: 1, customerId: 'buyer', payload, items, total: 20, fingerprint: JSON.stringify([[basketLineKey(items[0]), 2]]), options: { courierChoice: 'pickup' } });
  let owner = true, lockHeld = false;
  const args = { storage, accountId: 'buyer', ownsAccount: () => owner,
    locks: { request: async (name, options, action) => { assert.equal(name, 'proto-checkout:buyer'); assert.equal(options.mode, 'exclusive'); lockHeld = true; try { return await action(); } finally { lockHeld = false; } } } };
  return { storage, values, pending, args, setOwner: value => { owner = value; }, lockHeld: () => lockHeld };
}
const received = { state: 'received', success: true, orderId: 'saved-id', orderNumber: 'TEST-1', deliveryUnchecked: true };

test('read-only check submits only exact saved payload under lock and promotes receipt without touching basket', async () => {
  const f = fixture(); f.values.set('proto_cart_buyer', 'newer-basket-bytes');
  const result = await checkSavedCheckout({ ...f.args, request: async payload => { assert.equal(f.lockHeld(), true); assert.deepEqual(payload, f.pending.payload); return received; } });
  assert.equal(result.state, 'received'); assert.equal(readPendingCheckout(f.storage, 'buyer').status, 'accepted');
  assert.equal(f.values.get('proto_cart_buyer'), 'newer-basket-bytes');
  assert.equal(result.pending.payload.clientRef, f.pending.payload.clientRef);
});
test('not found preserves anchor bytes and never grants a new request', async () => {
  const f = fixture();
  const result = await checkSavedCheckout({ ...f.args, request: async () => ({ state: 'not_found', safeToStartNew: false, reconciliationRequired: true }) });
  assert.equal(result.state, 'not_found'); assert.equal(readPendingCheckout(f.storage, 'buyer').raw, f.pending.raw);
});
test('errors and malformed responses preserve exact pending bytes', async () => {
  for (const data of [null, {}, { state: 'not_found' }, { ...received, success: false }, { ...received, deliveryUnchecked: false }, { ...received, orderId: '' }]) {
    const f = fixture(); await assert.rejects(checkSavedCheckout({ ...f.args, request: async () => data }));
    assert.equal(readPendingCheckout(f.storage, 'buyer').raw, f.pending.raw);
  }
  const f = fixture(); await assert.rejects(checkSavedCheckout({ ...f.args, request: async () => { throw Error('503'); } }));
  assert.equal(readPendingCheckout(f.storage, 'buyer').raw, f.pending.raw);
});
test('account change during response cannot promote receipt', async () => {
  const f = fixture(); await assert.rejects(checkSavedCheckout({ ...f.args, request: async () => { f.setOwner(false); return received; } }), { code: 'AUTH_ACCOUNT_CHANGED' });
  assert.equal(readPendingCheckout(f.storage, 'buyer').raw, f.pending.raw);
});
test('changed pending raw during response cannot be overwritten', async () => {
  const f = fixture(); const changed = f.pending.raw + ' ';
  await assert.rejects(checkSavedCheckout({ ...f.args, request: async () => { f.storage.setItem('proto_pending_checkout_v1:buyer', changed); return received; } }), { code: 'CHECKOUT_ATTEMPT_CHANGED' });
  assert.equal(f.storage.getItem('proto_pending_checkout_v1:buyer'), changed);
});
test('native lock is required and missing anchor sends nothing', async () => {
  const f = fixture(); let calls = 0;
  await assert.rejects(checkSavedCheckout({ ...f.args, locks: null, request: async () => { calls++; } }));
  f.values.delete('proto_pending_checkout_v1:buyer');
  await assert.rejects(checkSavedCheckout({ ...f.args, request: async () => { calls++; } })); assert.equal(calls, 0);
});
test('denied or silent receipt promotion keeps server proof and original anchor without cleanup authority', async () => {
  for (const throws of [true, false]) {
    const f = fixture(); f.storage.setItem = () => { if (throws) throw Error('denied'); };
    const result = await checkSavedCheckout({ ...f.args, request: async () => received });
    assert.equal(result.state, 'received'); assert.equal(result.promotionFailed, true);
    assert.equal(result.result.orderNumber, received.orderNumber); assert.equal(result.pending.status, 'pending');
    assert.equal(readPendingCheckout(f.storage, 'buyer').raw, f.pending.raw);
  }
});
