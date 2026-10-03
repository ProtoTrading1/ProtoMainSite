const PREFIX = 'proto_pending_checkout_v1:';

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
    || !intent.options || typeof intent.options !== 'object') throw storageFailure();
  return intent;
}

// Never silently discard malformed or unreadable recovery data: a previous
// request may have committed even when this browser did not receive its reply.
export function readPendingCheckout(storage, customerId) {
  if (!customerId) return null;
  try {
    const raw = storage.getItem(`${PREFIX}${customerId}`);
    return raw === null ? null : validate(JSON.parse(raw), customerId);
  } catch { throw storageFailure(); }
}

export function writePendingCheckout(storage, customerId, intent) {
  try {
    validate(intent, customerId);
    const previous = readPendingCheckout(storage, customerId);
    if (previous && previous.payload.clientRef !== intent.payload.clientRef) throw storageFailure();
    const encoded = JSON.stringify(intent);
    storage.setItem(`${PREFIX}${customerId}`, encoded);
    if (storage.getItem(`${PREFIX}${customerId}`) !== encoded) throw storageFailure();
    return JSON.parse(encoded);
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
