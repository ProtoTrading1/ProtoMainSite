import { basketLineKey, mergeBasketLines } from '../../lib/basket-lines.mjs';
import { normalizeItemPreference } from '../../lib/item-preference.mjs';
import { validStoredCartItems, storedCartBytesWithinLimit } from './cartStorage.mjs';

const key = id => `proto_pending_checkout_v1:${id}`;
const legacyKey = id => `proto_checkout_attempt_${id}`;
const deliveryMethods = { own: "Customer's own courier", proto: 'Proto Trading delivers', pickup: 'In store pick up' };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const source = product => product.source ?? (product.isExtendedRange === true ? 'instore' : 'main');
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const serverSku = product => clean(product.sku || product.id).toUpperCase();
const serverBarcode = product => clean(product.code || product.barcode);
const fingerprint = items => JSON.stringify(mergeBasketLines(items).map(item => [basketLineKey(item), Number(item.qty || 0)]));
const stable = value => JSON.stringify(value, function (_key, child) {
  return object(child) ? Object.fromEntries(Object.keys(child).sort().map(name => [name, child[name]])) : child;
});

function failure(code = 'CHECKOUT_RECOVERY_STORAGE') {
  const error = new Error(code === 'CHECKOUT_LEGACY_RECONCILIATION'
    ? 'An earlier order reference needs reconciliation. Check My Orders or contact Proto before ordering again. Your original request is kept on this device.'
    : 'We cannot safely save or recover this order request on this device. Check My Orders or contact Proto before ordering again.');
  error.code = code;
  return error;
}

function validate(intent, customerId) {
  if (typeof customerId !== 'string' || !customerId.trim() || intent?.version !== 1 || intent.customerId !== customerId
    || !object(intent.payload) || typeof intent.payload.clientRef !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(intent.payload.clientRef)
    || !validStoredCartItems(intent.payload.items) || !intent.payload.items.length
    || !validStoredCartItems(intent.items) || intent.items.length !== intent.payload.items.length
    || intent.fingerprint !== fingerprint(intent.items) || intent.fingerprint !== fingerprint(intent.payload.items)
    || !Number.isFinite(intent.total) || intent.total < 0 || !object(intent.options)
    || deliveryMethods[intent.options.courierChoice] !== intent.payload.deliveryMethod
    || typeof intent.payload.customerNotes !== 'string'
    || String(intent.options.customerNotes || '').trim() !== intent.payload.customerNotes
    || (intent.payload.promoCode ?? null) !== (intent.options.promo?.code ?? null)) throw failure();
  let total = 0;
  const lineIdentities = new Map();
  for (let index = 0; index < intent.items.length; index++) {
    const item = intent.items[index], sent = intent.payload.items[index];
    const snapshot = sent.product.checkoutSnapshot;
    if (basketLineKey(item) !== basketLineKey(sent) || item.qty !== sent.qty || source(item.product) !== source(sent.product)
      || serverSku(item.product) !== serverSku(sent.product) || serverBarcode(item.product) !== serverBarcode(sent.product)
      || normalizeItemPreference(item.preference) !== normalizeItemPreference(sent.preference)
      || (item.product.isExtendedRange === true) !== (sent.product.isExtendedRange === true)
      || (source(item.product) === 'instore') !== (item.product.isExtendedRange === true)
      || (source(sent.product) === 'instore') !== (sent.product.isExtendedRange === true)
      || !object(snapshot) || !Number.isFinite(snapshot.unitPrice) || snapshot.unitPrice < 0
      || (snapshot.stockQty !== null && (!Number.isSafeInteger(snapshot.stockQty) || snapshot.stockQty < 0))
      || !Number.isFinite(item.product.price) || item.product.price < 0
      || Math.round(item.product.price * 100) / 100 !== snapshot.unitPrice) throw failure();
    const identity = JSON.stringify([serverSku(sent.product), serverBarcode(sent.product), sent.product.isExtendedRange === true]);
    const lineKey = basketLineKey(sent);
    if (lineIdentities.has(lineKey) && lineIdentities.get(lineKey) !== identity) throw failure();
    lineIdentities.set(lineKey, identity);
    total += item.product.price * item.qty;
  }
  if (!Number.isFinite(total) || Math.abs(total - intent.total) > 0.005
    || (intent.status !== undefined && !['pending', 'accepted'].includes(intent.status))
    || (intent.dispatchCount != null && (!Number.isSafeInteger(intent.dispatchCount) || intent.dispatchCount < 0))
    || (intent.reviewRequired !== undefined && typeof intent.reviewRequired !== 'boolean')
    || (intent.confirmedRejectedBeforeCapture !== undefined && typeof intent.confirmedRejectedBeforeCapture !== 'boolean')
    || (intent.result !== undefined && (!object(intent.result) || intent.result.success !== true))
    || (intent.status === 'accepted' && !intent.result)
    || (intent.result && intent.status === 'pending')
    || (intent.confirmedRejectedBeforeCapture === true
      && (intent.dispatchCount !== 1 || intent.status !== 'pending' || intent.reviewRequired !== true))) throw failure();
  return intent;
}

function decoded(raw, customerId) {
  if (!storedCartBytesWithinLimit(raw)) throw failure();
  const value = validate(JSON.parse(raw), customerId);
  // PR262 records without dispatch counts are uncertain. Replay their exact v3
  // payload; they cannot authorize a changed basket or checkout snapshot.
  const intent = { ...value, status: value.status ?? (value.result ? 'accepted' : 'pending'),
    dispatchCount: value.dispatchCount ?? null };
  Object.defineProperty(intent, 'raw', { value: raw });
  return intent;
}

export async function withPendingCheckoutLock(locks, customerId, action) {
  if (!customerId || typeof locks?.request !== 'function') throw failure('CHECKOUT_LOCK_REQUIRED');
  return locks.request(`proto-checkout:${customerId}`, { mode: 'exclusive' }, action);
}

// Never remove or migrate uncertain evidence automatically. Even malformed legacy
// bytes may represent a captured order whose reply was lost.
export function readPendingCheckout(storage, customerId) {
  if (!customerId) return null;
  try {
    if (storage.getItem(legacyKey(customerId)) !== null) throw failure('CHECKOUT_LEGACY_RECONCILIATION');
    const raw = storage.getItem(key(customerId));
    return raw === null ? null : decoded(raw, customerId);
  } catch (error) {
    if (error.code === 'CHECKOUT_LEGACY_RECONCILIATION') throw error;
    throw failure();
  }
}

export function verifyPendingCheckout(storage, intent) {
  const current = readPendingCheckout(storage, intent.customerId);
  if (!current || typeof intent.raw !== 'string' || current.raw !== intent.raw) throw failure('CHECKOUT_ATTEMPT_CHANGED');
  return current;
}

function persist(storage, customerId, value, previous) {
  try {
    const raw = JSON.stringify(value);
    const next = decoded(raw, customerId);
    const current = readPendingCheckout(storage, customerId);
    if ((current?.raw ?? null) !== (previous?.raw ?? null)) throw failure('CHECKOUT_ATTEMPT_CHANGED');
    storage.setItem(key(customerId), raw);
    if (storage.getItem(key(customerId)) !== raw || storage.getItem(legacyKey(customerId)) !== null) throw failure();
    return next;
  } catch (error) { throw error.code ? error : failure(); }
}

/** Caller holds the native account lock through staging, verification and POST. */
export function writePendingCheckout(storage, customerId, intent) {
  try {
    validate(intent, customerId);
    const previous = readPendingCheckout(storage, customerId);
    if (intent.raw !== undefined && previous?.raw !== intent.raw) throw failure('CHECKOUT_ATTEMPT_CHANGED');
    if (previous && previous.payload.clientRef !== intent.payload.clientRef) throw failure();
    const changed = previous && stable(previous.payload) !== stable(intent.payload);
    if (previous && stable(previous.options) !== stable(intent.options)) throw failure('CHECKOUT_ATTEMPT_UNRESOLVED');
    if (changed && previous.confirmedRejectedBeforeCapture !== true) throw failure('CHECKOUT_ATTEMPT_UNRESOLVED');
    const value = { ...intent, status: previous?.status ?? 'pending',
      dispatchCount: previous ? previous.dispatchCount : 0,
      reviewRequired: intent.reviewRequired ?? previous?.reviewRequired ?? false,
      confirmedRejectedBeforeCapture: previous?.confirmedRejectedBeforeCapture === true };
    if (previous?.result) value.result = previous.result;
    if (value.result) { value.status = 'accepted'; value.confirmedRejectedBeforeCapture = false; }
    if (changed) { value.dispatchCount = 0; value.reviewRequired = false; value.confirmedRejectedBeforeCapture = false; }
    // A fresh caller cannot fabricate first-response rejection proof.
    if (!previous) value.confirmedRejectedBeforeCapture = false;
    delete value.raw;
    return persist(storage, customerId, value, previous);
  } catch (error) { throw error.code ? error : failure(); }
}

export function recordPendingCheckoutDispatch(storage, intent) {
  const current = verifyPendingCheckout(storage, intent);
  if (current.status !== 'pending') throw failure('CHECKOUT_ATTEMPT_UNRESOLVED');
  return persist(storage, current.customerId, { ...current,
    dispatchCount: current.dispatchCount === null || current.dispatchCount === Number.MAX_SAFE_INTEGER ? null : current.dispatchCount + 1,
    confirmedRejectedBeforeCapture: false }, current);
}

/** Call only for the API's explicit ORDER_REVIEW_REQUIRED response. */
export function recordPendingCheckoutReview(storage, intent, reviewChanges = []) {
  const current = verifyPendingCheckout(storage, intent);
  if (current.status !== 'pending') throw failure('CHECKOUT_ATTEMPT_UNRESOLVED');
  return persist(storage, current.customerId, { ...current, reviewRequired: true, reviewChanges,
    confirmedRejectedBeforeCapture: current.dispatchCount === 1 }, current);
}

export function acceptPendingCheckout(storage, intent, result) {
  const current = verifyPendingCheckout(storage, intent);
  return persist(storage, current.customerId, { ...current, status: 'accepted', result,
    confirmedRejectedBeforeCapture: false }, current);
}

/** Caller holds the native account lock. Submitted clears require their ACK.
 * An explicit receipt action may instead preserve a different, freshly verified
 * synced basket; the caller owns the account epoch, revision and journal checks.
 */
export function finishPendingCheckout(storage, customerId, clientRef, proof) {
  try {
    const current = readPendingCheckout(storage, customerId);
    if (!current) return true;
    const preserved = proof?.acknowledgedBasketPreserved === true
      && typeof proof.currentFingerprint === 'string' && proof.currentFingerprint.length > 0
      && proof.currentFingerprint !== current.fingerprint
      && Number.isSafeInteger(proof.remoteRevision) && proof.remoteRevision >= 0;
    if (current.payload.clientRef !== clientRef || current.status !== 'accepted'
      || (proof?.acknowledgedSubmittedClear !== true && !preserved)) return false;
    verifyPendingCheckout(storage, current);
    storage.removeItem(key(customerId));
    return storage.getItem(key(customerId)) === null;
  } catch { return false; }
}

export function clearPendingCheckout(storage, customerId, clientRef, proof) {
  if (!finishPendingCheckout(storage, customerId, clientRef, proof)) throw failure();
}

export function submittedBasketStillCurrent(intent, currentFingerprint) {
  return intent.fingerprint === currentFingerprint;
}
