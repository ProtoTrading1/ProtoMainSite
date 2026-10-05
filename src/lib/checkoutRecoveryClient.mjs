import { readPendingCheckout, verifyPendingCheckout, withPendingCheckoutLock, acceptPendingCheckout } from './pendingCheckout.mjs';

function hold(code = 'CHECKOUT_RECOVERY_UNCONFIRMED') {
  const error = new Error('We could not confirm the saved request. Your saved request and current basket have been kept. Check My Orders or contact Proto before sending another order.');
  error.code = code;
  return error;
}

function receipt(data) {
  if (data?.state !== 'received' || data.success !== true || data.deliveryUnchecked !== true
    || typeof data.orderId !== 'string' || !data.orderId.trim() || data.orderId.length > 128
    || typeof data.orderNumber !== 'string' || !data.orderNumber.trim() || data.orderNumber.length > 128) throw hold();
  // Store only the receipt contract, never arbitrary returned fields.
  return { success: true, orderId: data.orderId, orderNumber: data.orderNumber, deliveryUnchecked: true };
}

/** Read-only server lookup. The only client write is exact receipt promotion.
 * No basket cleanup, reference retirement, dispatch count or order replay. */
export async function checkSavedCheckout({ storage, locks, accountId, ownsAccount, request }) {
  const assertOwner = () => { if (!ownsAccount()) throw hold('AUTH_ACCOUNT_CHANGED'); };
  assertOwner();
  return withPendingCheckoutLock(locks, accountId, async () => {
    assertOwner();
    const pending = readPendingCheckout(storage, accountId);
    if (!pending) throw hold('CHECKOUT_ATTEMPT_CHANGED');
    verifyPendingCheckout(storage, pending);
    const data = await request(pending.payload);
    assertOwner();
    verifyPendingCheckout(storage, pending);
    if (data?.state === 'not_found' && data.safeToStartNew === false && data.reconciliationRequired === true) {
      return { state: 'not_found', pending };
    }
    const result = receipt(data);
    if (pending.status === 'accepted' && (pending.result.orderId !== result.orderId
      || pending.result.orderNumber !== result.orderNumber)) throw hold('CHECKOUT_RECEIPT_CHANGED');
    try {
      const accepted = acceptPendingCheckout(storage, pending, result);
      return { state: 'received', pending: accepted, result, promotionFailed: false };
    } catch (error) {
      if (error.code !== 'CHECKOUT_RECOVERY_STORAGE') throw error;
      // Exact server receipt remains evidence even if this browser cannot save
      // it. Keep the original intent; it grants no cleanup or retirement proof.
      return { state: 'received', pending, result, promotionFailed: true };
    }
  });
}

export function savedCheckoutSummary(pending) {
  return pending ? { lineCount: pending.items.length, total: pending.total,
    fingerprint: pending.fingerprint, clientRef: pending.payload.clientRef } : null;
}
