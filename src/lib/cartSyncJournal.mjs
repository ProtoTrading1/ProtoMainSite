import { validStoredCartItems, storedCartBytesWithinLimit } from './cartStorage.mjs';

const key = (accountId) => `proto_cart_pending_${accountId}`;
const intents = ['normal', 'restore', 'submitted_clear'];
const minimumActivityAt = Date.UTC(2000, 0, 1);

function validDraft(draft, accountId) {
  return typeof accountId === 'string' && accountId.trim().length > 0
    && draft?.accountId === accountId
    && validStoredCartItems(draft.items)
    && Number.isSafeInteger(draft.baseRevision) && draft.baseRevision >= 0
    && Number.isSafeInteger(draft.activityAt) && draft.activityAt >= minimumActivityAt
    && ['save', 'clear'].includes(draft.type)
    && (draft.type !== 'clear' || draft.items.length === 0)
    && intents.includes(draft.intent);
}

function validExistingRaw(raw, accountId) {
  if (raw === null) return true;
  try { return storedCartBytesWithinLimit(raw) && validDraft(JSON.parse(raw), accountId); }
  catch { return false; }
}

export function readPendingCart(storage, accountId) {
  if (!accountId) return null;
  try {
    const raw = storage.getItem(key(accountId));
    if (!storedCartBytesWithinLimit(raw)) return null;
    const draft = JSON.parse(raw);
    if (!validDraft(draft, accountId)) return null;
    return draft;
  } catch { return null; }
}

export function encodePendingCart(accountId, operation, baseRevision) {
  if (!operation) return null;
  const draft = { accountId, items: operation.items, activityAt: operation.activityAt,
    type: operation.type, intent: operation.intent === undefined ? 'normal' : operation.intent, baseRevision };
  if (!validDraft(draft, accountId)) return null;
  try {
    const raw = JSON.stringify(draft);
    return storedCartBytesWithinLimit(raw) ? raw : null;
  } catch { return null; }
}

export function writePendingCart(storage, accountId, operation, baseRevision) {
  const encoded = encodePendingCart(accountId, operation, baseRevision);
  if (encoded === null) return false;
  try {
    if (!validExistingRaw(storage.getItem(key(accountId)), accountId)) return false;
    storage.setItem(key(accountId), encoded);
    return storage.getItem(key(accountId)) === encoded;
  } catch { return false; }
}

export function clearPendingCart(storage, accountId, expectedRaw) {
  if (typeof accountId !== 'string' || !accountId.trim()) return false;
  try {
    const currentRaw = storage.getItem(key(accountId));
    if (currentRaw === null) return true;
    if (arguments.length >= 3 && currentRaw !== expectedRaw) return false;
    storage.removeItem(key(accountId));
    return storage.getItem(key(accountId)) === null;
  } catch { return false; }
}

// Recovery copies are independent immutable slots. They preserve evidence when
// another tab (including an older client) overwrites the shared pending slot;
// they do not make localStorage transactions atomic or authorize replay.
export const MAX_PENDING_CART_RECOVERY_COPIES = 20;
const recoveryPrefix = accountId => `proto_cart_recovery:${encodeURIComponent(accountId)}:`;
// Module state belongs to this tab. Matching foreign bytes do not establish
// ownership, including copies left by a prior page load of this browser.
const ownedRecoveryCopies = new WeakMap();

function recoveryStorageError() {
  const error = new Error('Pending basket recovery copies could not be checked');
  error.code = 'cart_device_storage';
  return error;
}

export function readPendingCartRecoveryCopies(storage, accountId) {
  if (typeof accountId !== 'string' || !accountId.trim()) throw recoveryStorageError();
  try {
    if (!Number.isSafeInteger(storage?.length) || storage.length < 0 || storage.length > 10000
      || typeof storage.key !== 'function') throw recoveryStorageError();
    const keys = new Set();
    const prefix = recoveryPrefix(accountId);
    const length = storage.length;
    for (let index = 0; index < length; index++) {
      const entry = storage.key(index);
      if (typeof entry === 'string' && entry.startsWith(prefix)) keys.add(entry);
    }
    return [...keys].sort().flatMap(entry => {
      const raw = storage.getItem(entry);
      if (raw === null) return [];
      let draft = null;
      try { if (storedCartBytesWithinLimit(raw)) draft = JSON.parse(raw); } catch { /* keep invalid evidence */ }
      return [{ key: entry, raw, draft: validDraft(draft, accountId) ? draft : null }];
    });
  } catch { throw recoveryStorageError(); }
}

export function writeRecoverablePendingCart(storage, accountId, operation, baseRevision) {
  const raw = encodePendingCart(accountId, operation, baseRevision);
  const failed = { kept: false, copyKey: null, raw };
  if (raw === null) return failed;
  let copyKey = null;
  try {
    if (!validExistingRaw(storage.getItem(key(accountId)), accountId)) return failed;
    // The API uses a 2 MiB body cap. Never multiply an unbounded device record.
    if (new TextEncoder().encode(raw).byteLength > 2 * 1024 * 1024) return failed;
    const copies = readPendingCartRecoveryCopies(storage, accountId);
    let owned = ownedRecoveryCopies.get(storage);
    if (!owned) { owned = new Map(); ownedRecoveryCopies.set(storage, owned); }
    const ownedKey = owned.get(raw);
    if (ownedKey && storage.getItem(ownedKey) === raw) copyKey = ownedKey;
    if (!copyKey) {
      if (copies.length >= MAX_PENDING_CART_RECOVERY_COPIES) return failed;
      if (!globalThis.crypto?.randomUUID) return failed;
      copyKey = `${recoveryPrefix(accountId)}${globalThis.crypto.randomUUID()}`;
      if (storage.getItem(copyKey) !== null) return failed;
      storage.setItem(copyKey, raw);
      if (storage.getItem(copyKey) !== raw) return failed;
      owned.set(raw, copyKey);
      // Concurrent writers can stage simultaneously. Keep every staged copy,
      // but refuse further shared publication if the observed cap is exceeded.
      if (readPendingCartRecoveryCopies(storage, accountId).length > MAX_PENDING_CART_RECOVERY_COPIES) {
        return { kept: false, copyKey, raw };
      }
    }
    if (!validExistingRaw(storage.getItem(key(accountId)), accountId)) return { kept: false, copyKey, raw };
    storage.setItem(key(accountId), raw);
    return { kept: storage.getItem(key(accountId)) === raw, copyKey, raw };
  } catch { return { kept: false, copyKey, raw }; }
}

export function retireSupersededPendingCartRecoveryCopy(storage, accountId, previousCopyKey, previousRaw, successor) {
  if (!successor?.kept || typeof previousCopyKey !== 'string' || typeof previousRaw !== 'string'
    || typeof successor.copyKey !== 'string' || typeof successor.raw !== 'string'
    || previousCopyKey === successor.copyKey) return false;
  try {
    const prefix = recoveryPrefix(accountId);
    const owned = ownedRecoveryCopies.get(storage);
    if (!previousCopyKey.startsWith(prefix) || !successor.copyKey.startsWith(prefix)
      || owned?.get(previousRaw) !== previousCopyKey || owned.get(successor.raw) !== successor.copyKey
      || storage.getItem(key(accountId)) !== successor.raw || storage.getItem(successor.copyKey) !== successor.raw
      || storage.getItem(previousCopyKey) !== previousRaw) return false;
    storage.removeItem(previousCopyKey);
    if (storage.getItem(previousCopyKey) !== null) return false;
    owned.delete(previousRaw);
    return true;
  } catch { return false; }
}

export function acknowledgePendingCartRecoveryCopies(storage, accountId, expectedRaw) {
  if (!storedCartBytesWithinLimit(expectedRaw)) return false;
  let expected;
  try { expected = JSON.parse(expectedRaw); } catch { return false; }
  if (!validDraft(expected, accountId)) return false;
  try {
    const copies = readPendingCartRecoveryCopies(storage, accountId);
    for (const copy of copies) {
      if (copy.raw !== expectedRaw || !copy.draft) continue;
      // Legitimate writers never change an existing copy key. A changed key
      // remains evidence and requires explicit review rather than deletion.
      if (storage.getItem(copy.key) !== expectedRaw) return false;
      storage.removeItem(copy.key);
      if (storage.getItem(copy.key) !== null) return false;
    }
    return true;
  } catch { return false; }
}
