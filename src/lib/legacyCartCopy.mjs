const prefix = 'proto_cart_device_copy_v1_';
const quantities = (items) => JSON.stringify(items.map((item) => [
  String(item?.product?.id || item?.product?.sku || item?.product?.code || ''),
  item?.qty, String(item?.preference || ''),
]));

export function readLegacyCartCopy(storage, accountId) {
  if (!accountId) return null;
  try {
    const copy = JSON.parse(storage.getItem(`${prefix}${accountId}`) || 'null');
    if (copy?.accountId !== accountId || !Array.isArray(copy.items) || !copy.items.length
      || copy.items.length > 250 || !copy.items.every((item) => item?.product
        && Number.isSafeInteger(item.qty) && item.qty > 0)) return null;
    return copy;
  } catch { return null; }
}

function withCopyLock(accountId, operation) {
  const locks = typeof window === 'undefined' ? null : globalThis.navigator?.locks;
  return locks ? locks.request(`proto-device-copy-${accountId}`, operation) : Promise.resolve().then(operation);
}

export function preserveLegacyCartCopy(storage, accountId, items, activityAt, shouldProceed = () => true) {
  return withCopyLock(accountId, () => shouldProceed() ? preserveCopy(storage, accountId, items, activityAt) : null);
}

function preserveCopy(storage, accountId, items, activityAt) {
  const existing = readLegacyCartCopy(storage, accountId);
  if (existing && quantities(existing.items) === quantities(items)) return existing;
  const copy = { accountId, items, activityAt, savedAt: Date.now() };
  const encoded = JSON.stringify(copy);
  try {
    // If an earlier different/corrupt copy exists, leave both that copy and
    // today's canonical device basket untouched for review.
    const previous = storage.getItem(`${prefix}${accountId}`);
    if (previous !== null) {
      if (existing) throw new Error('A different device copy is already kept');
      // Keep unreadable bytes separately before replacing the broken slot.
      // A verified archive avoids trapping an otherwise valid local basket.
      const archiveKey = `${prefix}${accountId}_unreadable_${Date.now()}_${globalThis.crypto.randomUUID()}`;
      storage.setItem(archiveKey, previous);
      if (storage.getItem(archiveKey) !== previous || storage.getItem(`${prefix}${accountId}`) !== previous) {
        throw new Error('Unreadable copy could not be retained');
      }
    }
    storage.setItem(`${prefix}${accountId}`, encoded);
    if (storage.getItem(`${prefix}${accountId}`) !== encoded) throw new Error('Copy not confirmed');
    return copy;
  } catch {
    const error = new Error('Your device basket could not be preserved. Keep this page open and contact Proto before clearing it.');
    error.code = 'cart_device_storage';
    error.status = 422;
    throw error;
  }
}

export function discardLegacyCartCopy(storage, accountId, expectedCopy, shouldProceed = () => true) {
  return withCopyLock(accountId, () => shouldProceed() && discardCopy(storage, accountId, expectedCopy));
}

function discardCopy(storage, accountId, expectedCopy) {
  try {
    const current = readLegacyCartCopy(storage, accountId);
    if (!expectedCopy || !current || JSON.stringify(current) !== JSON.stringify(expectedCopy)) return false;
    storage.removeItem(`${prefix}${accountId}`);
    return storage.getItem(`${prefix}${accountId}`) === null;
  } catch { return false; }
}
