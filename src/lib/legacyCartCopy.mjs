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

export function preserveLegacyCartCopy(storage, accountId, items, activityAt) {
  const existing = readLegacyCartCopy(storage, accountId);
  if (existing && quantities(existing.items) === quantities(items)) return existing;
  const copy = { accountId, items, activityAt, savedAt: Date.now() };
  const encoded = JSON.stringify(copy);
  try {
    // If an earlier different/corrupt copy exists, leave both that copy and
    // today's canonical device basket untouched for review.
    if (storage.getItem(`${prefix}${accountId}`) !== null) throw new Error('A different device copy is already kept');
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

export function discardLegacyCartCopy(storage, accountId) {
  try {
    storage.removeItem(`${prefix}${accountId}`);
    return storage.getItem(`${prefix}${accountId}`) === null;
  } catch { return false; }
}
