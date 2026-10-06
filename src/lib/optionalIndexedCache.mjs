// Persistent catalogue caches are optional. Browser storage must never own an
// unbounded wait ahead of the authenticated live catalogue.
export const OPTIONAL_CACHE_WAIT_MS = 1000;

function close(db) {
  try { db?.close(); } catch { /* optional cache */ }
}

function abort(transaction) {
  try { transaction?.abort(); } catch { /* already completed */ }
}

export function openOptionalCache(name, version, store) {
  return new Promise((resolve) => {
    let settled = false;
    let request;
    const finish = (db = null) => {
      if (settled) { close(db); return; }
      settled = true;
      clearTimeout(timer);
      resolve(db);
    };
    const timer = setTimeout(() => finish(), OPTIONAL_CACHE_WAIT_MS);
    try {
      if (typeof indexedDB === 'undefined') { finish(); return; }
      request = indexedDB.open(name, version);
      request.onblocked = () => finish();
      request.onerror = () => finish();
      request.onupgradeneeded = () => {
        if (settled) { abort(request.transaction); close(request.result); return; }
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
          else request.transaction.objectStore(store).clear();
        } catch { abort(request.transaction); finish(); }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!settled) db.onversionchange = () => close(db);
        finish(db);
      };
    } catch { finish(); }
  });
}

export function runOptionalCache(db, store, mode, operation) {
  return new Promise((resolve) => {
    let settled = false;
    let transaction;
    let value = null;
    const finish = (result = null, cancel = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (cancel) abort(transaction);
      close(db);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null, true), OPTIONAL_CACHE_WAIT_MS);
    try {
      transaction = db.transaction(store, mode);
      transaction.oncomplete = () => finish(value);
      transaction.onerror = () => finish(null, true);
      transaction.onabort = () => finish();
      const request = operation(transaction.objectStore(store));
      if (request) {
        request.onsuccess = () => { if (!settled) value = request.result ?? null; };
        request.onerror = () => finish(null, true);
      }
    } catch { finish(null, true); }
  });
}
