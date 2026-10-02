import { validStoredCartItems } from './cartStorage.mjs';

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

export function readPendingCart(storage, accountId) {
  if (!accountId) return null;
  try {
    const draft = JSON.parse(storage.getItem(key(accountId)) || 'null');
    if (!validDraft(draft, accountId)) return null;
    return draft;
  } catch { return null; }
}

export function encodePendingCart(accountId, operation, baseRevision) {
  if (!operation) return null;
  const draft = { accountId, items: operation.items, activityAt: operation.activityAt,
    type: operation.type, intent: operation.intent === undefined ? 'normal' : operation.intent, baseRevision };
  if (!validDraft(draft, accountId)) return null;
  try { return JSON.stringify(draft); } catch { return null; }
}

export function writePendingCart(storage, accountId, operation, baseRevision) {
  const encoded = encodePendingCart(accountId, operation, baseRevision);
  if (encoded === null) return false;
  try {
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
