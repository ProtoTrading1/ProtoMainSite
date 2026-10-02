const key = (accountId) => `proto_cart_pending_${accountId}`;

export function readPendingCart(storage, accountId) {
  if (!accountId) return null;
  try {
    const draft = JSON.parse(storage.getItem(key(accountId)) || 'null');
    if (draft?.accountId !== accountId || !Array.isArray(draft.items)
      || !Number.isSafeInteger(draft.baseRevision) || draft.baseRevision < 0
      || !['save', 'clear'].includes(draft.type)) return null;
    return draft;
  } catch { return null; }
}

export function writePendingCart(storage, accountId, operation, baseRevision) {
  if (!accountId || !operation || !Array.isArray(operation.items)
    || !Number.isSafeInteger(baseRevision) || baseRevision < 0) return false;
  try {
    storage.setItem(key(accountId), JSON.stringify({ accountId,
      items: operation.items, activityAt: operation.activityAt,
      type: operation.type, intent: operation.intent || 'normal', baseRevision }));
    return true;
  } catch { return false; }
}

export function clearPendingCart(storage, accountId) {
  if (!accountId) return false;
  try { storage.removeItem(key(accountId)); return true; } catch { return false; }
}
