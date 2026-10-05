import { validStoredCartItems, storedCartBytesWithinLimit } from './cartStorage.mjs';
import { basketLineKey, mergeBasketLines } from '../../lib/basket-lines.mjs';

const prefix = 'proto_cart_device_copy_v1_';
const quantities = items => JSON.stringify(mergeBasketLines(items).map(item => [basketLineKey(item), item.qty,
  item.product.source ?? null, item.product.isExtendedRange ?? null]));

export function readLegacyCartCopy(storage, accountId) {
  if (!accountId) return null;
  try {
    const raw = storage.getItem(`${prefix}${accountId}`);
    if (!storedCartBytesWithinLimit(raw)) return null;
    const copy = JSON.parse(raw);
    if (copy?.accountId !== accountId || !validStoredCartItems(copy.items) || !copy.items.length) return null;
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
  if (typeof accountId !== 'string' || !accountId.trim() || !validStoredCartItems(items) || !items.length) {
    const error = new Error('Your device basket cannot be safely preserved.');
    error.code = 'cart_device_storage';
    throw error;
  }
  const existing = readLegacyCartCopy(storage, accountId);
  if (existing && quantities(existing.items) === quantities(items)) return existing;
  const copy = { accountId, items, activityAt, savedAt: Date.now() };
  const encoded = JSON.stringify(copy);
  try {
    if (!storedCartBytesWithinLimit(encoded)) throw new Error('Device copy exceeds safe storage limit');
    // If an earlier different/corrupt copy exists, leave both that copy and
    // today's canonical device basket untouched for review.
    const previous = storage.getItem(`${prefix}${accountId}`);
    if (previous !== null) {
      if (existing) throw new Error('A different device copy is already kept');
      // Keep unreadable bytes separately before replacing the broken slot.
      // A verified archive avoids trapping an otherwise valid local basket.
      const archiveKey = `${prefix}${accountId}_unreadable_${Date.now()}_${globalThis.crypto.randomUUID()}`;
      if (storage.getItem(archiveKey) !== null) throw new Error('Unreadable archive slot already exists');
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
