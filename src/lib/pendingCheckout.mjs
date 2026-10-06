const PREFIX = 'proto_pending_checkout_v1:';
const stable = value => JSON.stringify(value, function (_key, child) {
  return child && typeof child === 'object' && !Array.isArray(child)
    ? Object.fromEntries(Object.keys(child).sort().map(name => [name, child[name]])) : child;
});

function storageFailure() {
  const error = new Error('We cannot safely save or recover this order request on this device. Check My Orders or contact Proto before ordering again.');
  error.code = 'CHECKOUT_RECOVERY_STORAGE';
  return error;
}

function validate(intent, customerId) {
  if (!customerId || intent?.version !== 1 || intent.customerId !== customerId
    || typeof intent.payload?.clientRef !== 'string' || !intent.payload.clientRef
    || !Array.isArray(intent.payload.items) || !intent.payload.items.length || intent.payload.items.length > 250
    || !Array.isArray(intent.items) || intent.items.length !== intent.payload.items.length
    || typeof intent.fingerprint !== 'string' || !intent.fingerprint
    || !Number.isFinite(intent.total) || intent.total < 0
    || !intent.options || typeof intent.options !== 'object'
    || (intent.dispatchCount !== undefined && intent.dispatchCount !== null
      && (!Number.isSafeInteger(intent.dispatchCount) || intent.dispatchCount < 0))
    || (intent.confirmedRejectedBeforeCapture !== undefined && typeof intent.confirmedRejectedBeforeCapture !== 'boolean')
    || (intent.confirmedRejectedBeforeCapture === true
      && (intent.dispatchCount !== 1 || intent.reviewRequired !== true || intent.result))) throw storageFailure();
  return intent;
}

function decoded(raw, customerId) {
  const intent = validate(JSON.parse(raw), customerId);
  intent.dispatchCount ??= null; // Historic journals cannot prove a first dispatch.
  Object.defineProperty(intent, 'raw', { value: raw });
  return intent;
}

export async function withPendingCheckoutLock(locks, customerId, action) {
  if (!customerId || typeof locks?.request !== 'function') throw storageFailure();
  return locks.request(`proto-checkout:${customerId}`, { mode: 'exclusive' }, action);
}

export function verifyPendingCheckout(storage, intent) {
  const current = readPendingCheckout(storage, intent.customerId);
  if (!current || typeof intent.raw !== 'string' || current.raw !== intent.raw) throw storageFailure();
  return current;
}

function persist(storage, customerId, value, previous) {
  const encoded = JSON.stringify(value);
  const next = decoded(encoded, customerId);
  const current = readPendingCheckout(storage, customerId);
  if ((current?.raw ?? null) !== (previous?.raw ?? null)) throw storageFailure();
  storage.setItem(`${PREFIX}${customerId}`, encoded);
  if (storage.getItem(`${PREFIX}${customerId}`) !== encoded) throw storageFailure();
  return next;
}

// Never silently discard malformed or unreadable recovery data: a previous
// request may have committed even when this browser did not receive its reply.
export function readPendingCheckout(storage, customerId) {
  if (!customerId) return null;
  try {
    if (storage.getItem(`proto_checkout_attempt_${customerId}`) !== null) throw storageFailure();
    const raw = storage.getItem(`${PREFIX}${customerId}`);
    return raw === null ? null : decoded(raw, customerId);
  } catch { throw storageFailure(); }
}

export function writePendingCheckout(storage, customerId, intent) {
  try {
    validate(intent, customerId);
    const previous = readPendingCheckout(storage, customerId);
    if (intent.raw !== undefined && previous?.raw !== intent.raw) throw storageFailure();
    if (previous && previous.payload.clientRef !== intent.payload.clientRef) throw storageFailure();
    if (previous && stable(previous.options) !== stable(intent.options)) throw storageFailure();
    const changed = previous && stable(previous.payload) !== stable(intent.payload);
    if (changed && previous.confirmedRejectedBeforeCapture !== true) throw storageFailure();
    const value = { ...intent, dispatchCount: previous ? previous.dispatchCount : 0,
      reviewRequired: intent.reviewRequired ?? previous?.reviewRequired ?? false,
      confirmedRejectedBeforeCapture: previous?.confirmedRejectedBeforeCapture === true };
    if (previous?.result) value.result = previous.result;
    if (changed) {
      value.dispatchCount = 0;
      value.reviewRequired = false;
      value.confirmedRejectedBeforeCapture = false;
    }
    if (value.result) value.confirmedRejectedBeforeCapture = false;
    delete value.raw;
    return persist(storage, customerId, value, previous);
  } catch { throw storageFailure(); }
}

// Caller holds the account lock and verifies the account epoch before dispatch.
export function recordPendingCheckoutDispatch(storage, intent) {
  try {
    const current = verifyPendingCheckout(storage, intent);
    if (current.result) throw storageFailure();
    return persist(storage, current.customerId, { ...current,
      dispatchCount: current.dispatchCount === null || current.dispatchCount === Number.MAX_SAFE_INTEGER
        ? null : current.dispatchCount + 1,
      confirmedRejectedBeforeCapture: false }, current);
  } catch { throw storageFailure(); }
}

export function recordPendingCheckoutRejection(storage, intent, error) {
  try {
    const current = verifyPendingCheckout(storage, intent);
    const explicitRejection = (error?.status === 400 && error?.code === 'ORDER_PRODUCT_UNAVAILABLE')
      || (error?.status === 409 && error?.code === 'ORDER_REVIEW_REQUIRED');
    if (current.result || !explicitRejection || error?.data?.rejectedBeforeCapture !== true) return current;
    return persist(storage, current.customerId, { ...current, reviewRequired: true,
      confirmedRejectedBeforeCapture: current.dispatchCount === 1 }, current);
  } catch { throw storageFailure(); }
}

export function clearPendingCheckout(storage, customerId, clientRef) {
  try {
    const previous = readPendingCheckout(storage, customerId);
    if (!previous) return;
    if (previous.payload.clientRef !== clientRef) throw storageFailure();
    storage.removeItem(`${PREFIX}${customerId}`);
    if (storage.getItem(`${PREFIX}${customerId}`) !== null) throw storageFailure();
  } catch { throw storageFailure(); }
}

export function submittedBasketStillCurrent(intent, currentFingerprint) {
  return intent.fingerprint === currentFingerprint;
}
