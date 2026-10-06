import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPendingCheckout, readPendingCheckout, recordPendingCheckoutDispatch, recordPendingCheckoutRejection, submittedBasketStillCurrent, writePendingCheckout } from '../src/lib/pendingCheckout.mjs';

const intent = (customerId = 'buyer') => ({ version: 1, customerId,
  payload: { clientRef: 'original-reference', items: [{ qty: 2, preference: 'Blue', product: { sku: 'ONE', checkoutSnapshot: { unitPrice: 10, stockQty: 5 } } }], deliveryMethod: 'In store pick up', customerNotes: 'Original notes' },
  items: [{ qty: 2, product: { id: 'ONE', price: 10 } }], total: 20,
  fingerprint: 'original-basket', options: { courierChoice: 'pickup', customerNotes: 'Original notes' },
});
function storage() {
  const data = new Map();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

test('reload restores exact intent independently of newer basket and customer isolation', () => {
  const device = storage(); const original = intent();
  writePendingCheckout(device, 'buyer', original);
  original.payload.items[0].qty = 99;
  assert.equal(readPendingCheckout(device, 'buyer').payload.items[0].qty, 2);
  assert.equal(readPendingCheckout(device, 'other-buyer'), null);
  assert.equal(submittedBasketStillCurrent(readPendingCheckout(device, 'buyer'), 'newer-basket'), false);
  assert.equal(submittedBasketStillCurrent(readPendingCheckout(device, 'buyer'), 'original-basket'), true);
});

test('storage denial, silent no-op and malformed recovery fail closed', () => {
  for (const device of [
    { getItem() { throw Error('denied'); } },
    { getItem: () => null, setItem() {} },
    { getItem: () => '{broken' },
  ]) assert.throws(() => writePendingCheckout(device, 'buyer', intent()), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  const device = storage(); device.data.set('proto_pending_checkout_v1:buyer', '{}');
  assert.throws(() => readPendingCheckout(device, 'buyer'), { code: 'CHECKOUT_RECOVERY_STORAGE' });
});

test('an unresolved reference cannot be replaced or cleared by another checkout', () => {
  const device = storage(); writePendingCheckout(device, 'buyer', intent());
  const other = intent(); other.payload.clientRef = 'different-reference';
  assert.throws(() => writePendingCheckout(device, 'buyer', other), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  assert.throws(() => clearPendingCheckout(device, 'buyer', 'different-reference'), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  assert.equal(readPendingCheckout(device, 'buyer').payload.clientRef, 'original-reference');
});

test('only proved first rejection authorizes amendment; accepted result survives interrupted cleanup', () => {
  const device = storage(); const pending = writePendingCheckout(device, 'buyer', intent());
  const reviewed = writePendingCheckout(device, 'buyer', { ...pending, reviewRequired: true });
  const amended = structuredClone(reviewed); amended.payload.items[0].qty = 1;
  assert.throws(() => writePendingCheckout(device, 'buyer', amended), { code: 'CHECKOUT_RECOVERY_STORAGE' });
  const dispatched = recordPendingCheckoutDispatch(device, readPendingCheckout(device, 'buyer'));
  const rejected = recordPendingCheckoutRejection(device, dispatched, {
    status: 400, code: 'ORDER_PRODUCT_UNAVAILABLE', data: { rejectedBeforeCapture: true },
  });
  const staged = writePendingCheckout(device, 'buyer', { ...amended, raw: rejected.raw });
  assert.equal(staged.dispatchCount, 0);
  assert.equal(staged.confirmedRejectedBeforeCapture, false);
  const sent = recordPendingCheckoutDispatch(device, staged);
  const accepted = writePendingCheckout(device, 'buyer', { ...sent, raw: sent.raw, result: { success: true, orderId: 'saved-order' } });
  assert.equal(readPendingCheckout(device, 'buyer').result.orderId, 'saved-order');
  assert.equal(accepted.payload.clientRef, pending.payload.clientRef);
  clearPendingCheckout(device, 'buyer', accepted.payload.clientRef);
  assert.equal(readPendingCheckout(device, 'buyer'), null);
});
