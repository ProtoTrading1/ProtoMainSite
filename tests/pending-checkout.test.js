import test from 'node:test';
import assert from 'node:assert/strict';
import { basketLineKey, mergeBasketLines } from '../lib/basket-lines.mjs';
import { clearPendingCheckout, readPendingCheckout, submittedBasketStillCurrent, writePendingCheckout,
  withPendingCheckoutLock, verifyPendingCheckout, recordPendingCheckoutDispatch, recordPendingCheckoutReview,
  acceptPendingCheckout, finishPendingCheckout } from '../src/lib/pendingCheckout.mjs';

const key = 'proto_pending_checkout_v1:buyer';
const legacyKey = 'proto_checkout_attempt_buyer';
const fingerprint = items => JSON.stringify(mergeBasketLines(items).map(item => [basketLineKey(item), item.qty]));
const intent = (customerId = 'buyer') => {
  const items = [{ qty: 2, preference: 'Blue', product: { id: 'ONE', sku: 'ONE', code: '111', price: 10,
    source: 'main', isExtendedRange: false } }];
  return { version: 1, customerId,
    payload: { clientRef: 'original-reference', items: items.map(item => ({ ...item, product: {
      id: item.product.id, sku: item.product.sku, code: item.product.code, source: 'main', isExtendedRange: false,
      checkoutSnapshot: { unitPrice: 10, stockQty: 5 } } })),
    deliveryMethod: 'In store pick up', customerNotes: 'Original notes', promoCode: null },
    items, total: 20, fingerprint: fingerprint(items),
    options: { courierChoice: 'pickup', customerNotes: 'Original notes' } };
};
function storage() {
  const data = new Map();
  return { data, getItem: name => data.get(name) ?? null, setItem: (name, value) => data.set(name, value),
    removeItem: name => data.delete(name) };
}
function amend(original, qty = 1, price = 11) {
  const next = structuredClone(original);
  next.items[0].qty = qty; next.payload.items[0].qty = qty;
  next.items[0].product.price = price; next.payload.items[0].product.checkoutSnapshot.unitPrice = price;
  next.total = qty * price; next.fingerprint = fingerprint(next.items);
  return next;
}

test('reload restores exact PR intent independently of newer basket and customer isolation', () => {
  const device = storage(), original = intent();
  const saved = writePendingCheckout(device, 'buyer', original);
  original.payload.items[0].qty = 99;
  assert.equal(readPendingCheckout(device, 'buyer').payload.items[0].qty, 2);
  assert.equal(readPendingCheckout(device, 'other-buyer'), null);
  assert.equal(submittedBasketStillCurrent(saved, 'newer-basket'), false);
  assert.equal(submittedBasketStillCurrent(saved, intent().fingerprint), true);
  assert.equal(saved.raw, device.getItem(key));
  assert.equal(JSON.stringify(saved).includes('"raw"'), false);
});

test('storage denial, silent no-op and malformed recovery fail closed preserving evidence', () => {
  for (const device of [{ getItem() { throw Error('denied'); } },
    { getItem: () => null, setItem() {} }]) {
    assert.throws(() => writePendingCheckout(device, 'buyer', intent()), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  }
  const device = storage();
  for (const raw of ['{broken', '{}', '[]', 'null']) {
    device.data.set(key, raw);
    assert.throws(() => readPendingCheckout(device, 'buyer'), { code: 'CHECKOUT_RECOVERY_STORAGE' });
    assert.equal(device.getItem(key), raw);
  }
});

test('unresolved references cannot be replaced, downgraded or retired without submitted-clear ACK', () => {
  const device = storage(), pending = writePendingCheckout(device, 'buyer', intent());
  const other = intent(); other.payload.clientRef = 'different-reference';
  assert.throws(() => writePendingCheckout(device, 'buyer', other), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  assert.throws(() => clearPendingCheckout(device, 'buyer', pending.payload.clientRef));
  assert.equal(finishPendingCheckout(device, 'buyer', pending.payload.clientRef, { acknowledgedSubmittedClear: true }), false);
  const accepted = acceptPendingCheckout(device, pending, { success: true, orderId: 'saved-order' });
  assert.equal(finishPendingCheckout(device, 'buyer', accepted.payload.clientRef), false);
  assert.equal(finishPendingCheckout(device, 'buyer', 'different-reference', { acknowledgedSubmittedClear: true }), false);
  assert.equal(readPendingCheckout(device, 'buyer').status, 'accepted');
  assert.equal(finishPendingCheckout(device, 'buyer', accepted.payload.clientRef, { acknowledgedSubmittedClear: true }), true);
  assert.equal(readPendingCheckout(device, 'buyer'), null);
});

test('first verified review permits explicit coherent amendment using original reference and options', () => {
  const device = storage();
  const dispatched = recordPendingCheckoutDispatch(device, writePendingCheckout(device, 'buyer', intent()));
  const reviewed = recordPendingCheckoutReview(device, dispatched, [{ sku: 'ONE', priceChanged: true }]);
  assert.equal(reviewed.confirmedRejectedBeforeCapture, true);
  const revised = writePendingCheckout(device, 'buyer', amend(reviewed));
  assert.equal(revised.payload.clientRef, dispatched.payload.clientRef);
  assert.equal(revised.dispatchCount, 0);
  assert.equal(revised.payload.items[0].product.checkoutSnapshot.unitPrice, 11);
  const changedOptions = amend(revised); changedOptions.options.customerNotes = 'Different notes';
  changedOptions.payload.customerNotes = 'Different notes';
  assert.throws(() => writePendingCheckout(device, 'buyer', changedOptions), { code: 'CHECKOUT_ATTEMPT_UNRESOLVED' });
});

test('lost first response followed by review cannot authorize altered quantity or changed v3 snapshot', () => {
  const device = storage();
  const first = recordPendingCheckoutDispatch(device, writePendingCheckout(device, 'buyer', intent()));
  const retry = recordPendingCheckoutDispatch(device, readPendingCheckout(device, 'buyer'));
  const reviewed = recordPendingCheckoutReview(device, retry);
  assert.equal(reviewed.dispatchCount, 2); assert.equal(reviewed.confirmedRejectedBeforeCapture, false);
  for (const changed of [amend(reviewed), amend(reviewed, 2, 11)]) {
    assert.throws(() => writePendingCheckout(device, 'buyer', changed), { code: 'CHECKOUT_ATTEMPT_UNRESOLVED' });
  }
  const same = writePendingCheckout(device, 'buyer', reviewed);
  assert.deepEqual(same.payload, first.payload);
});

test('genuine old PR262 pending intents replay exactly with uncertain dispatch count', () => {
  const device = storage(), previous = intent();
  // PR262 originally omitted payload source fields for main catalogue requests.
  delete previous.items[0].product.source; delete previous.payload.items[0].product.source;
  delete previous.items[0].product.isExtendedRange; delete previous.payload.items[0].product.isExtendedRange;
  device.data.set(key, JSON.stringify(previous));
  const recovered = readPendingCheckout(device, 'buyer');
  assert.equal(recovered.dispatchCount, null);
  const dispatched = recordPendingCheckoutDispatch(device, recovered);
  assert.deepEqual(dispatched.payload, previous.payload); assert.equal(dispatched.dispatchCount, null);
  const reviewed = recordPendingCheckoutReview(device, dispatched);
  assert.equal(reviewed.confirmedRejectedBeforeCapture, false);
  assert.throws(() => writePendingCheckout(device, 'buyer', amend(reviewed)), { code: 'CHECKOUT_ATTEMPT_UNRESOLVED' });
});

test('both legacy-only and simultaneous namespaces block fresh references without removing bytes', () => {
  for (const raw of ['{broken', JSON.stringify({ version: 1, accountId: 'buyer', clientRef: 'old-reference', status: 'pending' })]) {
    for (const current of [null, JSON.stringify(intent())]) {
      const device = storage(); device.data.set(legacyKey, raw);
      if (current) device.data.set(key, current);
      assert.throws(() => readPendingCheckout(device, 'buyer'), { code: 'CHECKOUT_LEGACY_RECONCILIATION' });
      assert.throws(() => writePendingCheckout(device, 'buyer', intent()), { code: 'CHECKOUT_LEGACY_RECONCILIATION' });
      assert.equal(device.getItem(legacyKey), raw); assert.equal(device.getItem(key), current);
    }
  }
});

test('strict item/payload/fingerprint/total/options/source and server resolver coherence fails closed', () => {
  const mutations = [
    value => { value.payload.items[0].qty = 1; },
    value => { value.payload.items[0].product.sku = 'OTHER'; },
    value => { value.payload.items[0].product.code = '222'; },
    value => { value.payload.items[0].preference = 'blue'; },
    value => { value.fingerprint = 'wrong'; },
    value => { value.total = 21; },
    value => { value.payload.items[0].product.checkoutSnapshot.unitPrice = 11; },
    value => { value.payload.items[0].product.checkoutSnapshot.stockQty = '5'; },
    value => { value.payload.items[0].product.isExtendedRange = 'true'; },
    value => { value.payload.items[0].product.source = 'instore'; },
    value => { value.options.courierChoice = 'proto'; },
    value => { value.payload.customerNotes = 'Changed'; },
    value => { value.options.promo = { code: 'PROMO' }; },
    value => { value.dispatchCount = -1; },
    value => { value.status = 'accepted'; },
    value => { value.result = { success: false }; },
    value => { value.status = 'pending'; value.dispatchCount = 2; value.reviewRequired = true; value.confirmedRejectedBeforeCapture = true; },
  ];
  for (const mutate of mutations) {
    const device = storage(), value = intent(); mutate(value);
    const raw = JSON.stringify(value); device.data.set(key, raw);
    assert.throws(() => readPendingCheckout(device, 'buyer'), { code: 'CHECKOUT_RECOVERY_STORAGE' });
    assert.equal(device.getItem(key), raw);
  }
});

test('changed persisted raw or stale proof cannot dispatch or accept an earlier intent', () => {
  const device = storage(), saved = writePendingCheckout(device, 'buyer', intent());
  const dispatched = recordPendingCheckoutDispatch(device, saved);
  assert.throws(() => verifyPendingCheckout(device, saved), { code: 'CHECKOUT_ATTEMPT_CHANGED' });
  assert.throws(() => acceptPendingCheckout(device, saved, { success: true }), { code: 'CHECKOUT_ATTEMPT_CHANGED' });
  assert.equal(readPendingCheckout(device, 'buyer').raw, dispatched.raw);
});

test('oversized durable records remain raw and cannot be staged or replayed', () => {
  const device = storage(), value = intent();
  value.payload.customerNotes = 'x'.repeat(2 * 1024 * 1024); value.options.customerNotes = value.payload.customerNotes;
  assert.throws(() => writePendingCheckout(device, 'buyer', value), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  assert.equal(device.getItem(key), null);
  const raw = JSON.stringify(value); device.data.set(key, raw);
  assert.throws(() => readPendingCheckout(device, 'buyer')); assert.equal(device.getItem(key), raw);
});

test('accepted order survives denied/silent journal plus allowed anchor deletion and clear503 interruption', () => {
  const device = storage(), captures = new Map();
  const dispatched = recordPendingCheckoutDispatch(device, writePendingCheckout(device, 'buyer', intent()));
  captures.set(dispatched.payload.clientRef, structuredClone(dispatched.payload));
  const accepted = acceptPendingCheckout(device, dispatched, { success: true, orderId: 'captured-once' });
  // Account-cart DELETE fails and shared journal publication silently disappears.
  device.setItem = () => {};
  assert.equal(finishPendingCheckout(device, 'buyer', accepted.payload.clientRef), false);
  const reloaded = readPendingCheckout(device, 'buyer');
  assert.equal(reloaded.status, 'accepted');
  assert.deepEqual(reloaded.payload, captures.get(dispatched.payload.clientRef));
  assert.equal(reloaded.result.orderId, 'captured-once'); assert.equal(captures.size, 1);
});

test('accepted promotion storage failure retains exact pending payload for same-ref replay after reload', () => {
  const device = storage(), dispatched = recordPendingCheckoutDispatch(device, writePendingCheckout(device, 'buyer', intent()));
  const originalRaw = device.getItem(key);
  device.setItem = () => {};
  assert.throws(() => acceptPendingCheckout(device, dispatched, { success: true, orderId: 'captured' }));
  const reloaded = readPendingCheckout(device, 'buyer');
  assert.equal(reloaded.raw, originalRaw); assert.equal(reloaded.payload.clientRef, dispatched.payload.clientRef);
  assert.deepEqual(reloaded.payload, dispatched.payload);
});

test('verified removal detects denied and silent deletion without losing accepted intent', () => {
  for (const mode of ['denied', 'silent']) {
    const device = storage(), pending = writePendingCheckout(device, 'buyer', intent());
    const accepted = acceptPendingCheckout(device, pending, { success: true, orderId: 'captured' });
    device.removeItem = () => { if (mode === 'denied') throw Error('denied'); };
    assert.equal(finishPendingCheckout(device, 'buyer', accepted.payload.clientRef, { acknowledgedSubmittedClear: true }), false);
    assert.equal(readPendingCheckout(device, 'buyer').status, 'accepted');
  }
});

test('native exclusive account lock serializes two tabs with one exact captured reference', async () => {
  const device = storage(), calls = [], captures = new Set(); let queue = Promise.resolve();
  const locks = { request(name, options, action) {
    calls.push({ name, options }); const run = queue.then(action); queue = run.catch(() => {}); return run;
  } };
  await Promise.all([1, 2].map(() => withPendingCheckoutLock(locks, 'buyer', () => {
    const current = readPendingCheckout(device, 'buyer') || writePendingCheckout(device, 'buyer', intent());
    const dispatch = recordPendingCheckoutDispatch(device, current);
    captures.add(dispatch.payload.clientRef);
  })));
  assert.equal(captures.size, 1);
  assert.deepEqual(calls, Array(2).fill({ name: 'proto-checkout:buyer', options: { mode: 'exclusive' } }));
  await assert.rejects(withPendingCheckoutLock(null, 'buyer', () => assert.fail()), { code: 'CHECKOUT_LOCK_REQUIRED' });
});


test('explicit preserved newer-basket proof requires accepted intent, different fingerprint and fresh revision', () => {
  const device = storage(), saved = writePendingCheckout(device, 'buyer', intent());
  const proof = { acknowledgedBasketPreserved: true, currentFingerprint: fingerprint(amend(saved).items), remoteRevision: 8 };
  assert.equal(finishPendingCheckout(device, 'buyer', saved.payload.clientRef, proof), false);
  const accepted = acceptPendingCheckout(device, saved, { success: true, orderId: 'captured' });
  for (const invalid of [{ acknowledgedBasketPreserved: true }, { ...proof, currentFingerprint: accepted.fingerprint },
    { ...proof, remoteRevision: -1 }, { ...proof, remoteRevision: '8' }]) {
    assert.equal(finishPendingCheckout(device, 'buyer', accepted.payload.clientRef, invalid), false);
    assert.equal(readPendingCheckout(device, 'buyer').status, 'accepted');
  }
  assert.equal(finishPendingCheckout(device, 'buyer', accepted.payload.clientRef, proof), true);
});

test('Instore source requires the strict server flag and duplicate basket identity cannot mix server sources', () => {
  const device = storage(), missingFlag = intent();
  missingFlag.items[0].product.source = 'instore'; missingFlag.payload.items[0].product.source = 'instore';
  delete missingFlag.items[0].product.isExtendedRange; delete missingFlag.payload.items[0].product.isExtendedRange;
  assert.throws(() => writePendingCheckout(device, 'buyer', missingFlag), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  const mixed = intent(), instoreItem = structuredClone(mixed.items[0]), instoreSent = structuredClone(mixed.payload.items[0]);
  instoreItem.product.source = 'instore'; instoreItem.product.isExtendedRange = true;
  instoreSent.product.source = 'instore'; instoreSent.product.isExtendedRange = true;
  mixed.items.push(instoreItem); mixed.payload.items.push(instoreSent); mixed.total = 40;
  mixed.fingerprint = fingerprint(mixed.items);
  assert.throws(() => writePendingCheckout(device, 'buyer', mixed), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  assert.equal(device.getItem(key), null);
});
