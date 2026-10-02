// Resolve browser storage only inside each operation: property access itself
// can throw when a browser denies persistence. Callers must report that failure.
export const browserCartStorage = {
  getItem: key => globalThis.window.localStorage.getItem(key),
  setItem: (key, value) => globalThis.window.localStorage.setItem(key, value),
  removeItem: key => globalThis.window.localStorage.removeItem(key),
};

const primitive = value => value == null || ['string', 'boolean'].includes(typeof value)
  || (typeof value === 'number' && Number.isFinite(value));
const identity = value => (typeof value === 'string' && value.trim().length > 0)
  || (typeof value === 'number' && Number.isFinite(value) && value !== 0);

export function validStoredCartItems(items) {
  try {
    return Array.isArray(items) && items.length <= 250 && Array.from(items).every(item => (
      item !== null && typeof item === 'object' && !Array.isArray(item)
      && item.product !== null && typeof item.product === 'object' && !Array.isArray(item.product)
      && Number.isSafeInteger(item.qty) && item.qty >= 1 && item.qty <= 9999
      && ['id', 'sku', 'code'].some(field => identity(item.product[field]))
      && ['id', 'sku', 'code', 'name'].every(field => primitive(item.product[field]))
      && primitive(item.preference)
    ));
  } catch { return false; }
}

export function readStoredCart(storage, key = 'proto_cart') {
  const raw = storage.getItem(key);
  if (raw === null) return { items: [], unreadableRaw: null };
  try {
    const items = JSON.parse(raw);
    if (validStoredCartItems(items)) return { items, unreadableRaw: null };
  } catch { /* Preserve unreadable bytes for explicit archival. */ }
  return { items: [], unreadableRaw: raw };
}

export function archiveUnreadableCart(storage, key, raw) {
  try {
    if (typeof raw !== 'string' || storage.getItem(key) !== raw) throw new Error('Stored basket changed');
    const archiveKey = `${key}_unreadable_${Date.now()}_${globalThis.crypto.randomUUID()}`;
    storage.setItem(archiveKey, raw);
    if (storage.getItem(archiveKey) !== raw || storage.getItem(key) !== raw) {
      throw new Error('Stored basket archive could not be confirmed');
    }
    return archiveKey;
  } catch {
    const error = new Error('Your device basket could not be preserved. Keep this page open and contact Proto before clearing it.');
    error.code = 'cart_device_storage';
    error.status = 422;
    throw error;
  }
}
