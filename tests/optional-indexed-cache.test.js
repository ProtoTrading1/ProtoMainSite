import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const helper = readFileSync(new URL('../src/lib/optionalIndexedCache.mjs', import.meta.url), 'utf8').replace(/^export /gm, '');
function fixture(module = 'products.js', mode = 'hangOpen') {
  const timers = new Map(); let id = 0; let request; let transaction; let operation; let closes = 0; let aborts = 0; let calls = 0;
  const live = [{ id: 'EXACT', sku: 'EXACT', stockQty: 7, source: 'main' }];
  const db = { close() { closes++; }, objectStoreNames: { contains: () => true }, transaction() {
    transaction = { abort() { aborts++; transaction.onabort?.(); }, objectStore() {
      return { get() { operation = {}; return operation; }, put() { operation = {}; return operation; }, delete() { operation = {}; return operation; }, clear() {} };
    } }; return transaction;
  } };
  const context = {
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); },
    indexedDB: { open() { request = {}; if (mode === 'throw') throw Error('optional unavailable'); return request; } },
    localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    window: { sessionStorage: { getItem: () => null }, requestIdleCallback: fn => fn() }, Date, AbortController,
    instoreRequestKey: () => 'catalogue=1', RESPONSE_CACHE_TTL_MS: 1000, instorePage: products => ({ products }),
    authenticatedGetJson: async url => { calls++; return context.network ? context.network(url) : { response: { ok: true }, data: url.includes('extended') ? { products: live, catalogue: live } : live }; },
    invalidateFeaturedCache() {}, preloadProductImages() {},
  };
  const source = readFileSync(new URL(`../src/lib/${module}`, import.meta.url), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  runInNewContext(helper + '\n' + source + '\nglobalThis.api = { openOptionalCache, runOptionalCache, ' +
    (module === 'products.js' ? 'getAllCached, loadFromIndexedCache, saveToIndexedCache, clearIndexedCache, fetchProductsBySkus, invalidateProductCache, refreshProductCache, cache: () => _cache' : 'readPersistedCollection, writePersistedCollection, clearPersistedCollection, prefetchInstoreCatalogue, hydrateInstoreCatalogue, clearStoredInstoreResponses, instoreCatalogue') + ' };', context);
  return { api: context.api, live, get request() { return request; }, get tx() { return transaction; }, get operation() { return operation; }, db,
    expire() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); },
    configure(values, code = '') { Object.assign(context, values); if (code) runInNewContext(code, context); },
    get closes() { return closes; }, get aborts() { return aborts; }, get calls() { return calls; }, get timers() { return timers.size; } };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

for (const module of ['products.js', 'extendedRange.js']) {
  const read = module === 'products.js' ? 'loadFromIndexedCache' : 'readPersistedCollection';
  const write = module === 'products.js' ? 'saveToIndexedCache' : 'writePersistedCollection';
  test(`${module}: blocked open misses immediately; late success closes without publication`, async () => {
    const f = fixture(module); const pending = f.api[read]();
    f.request.onblocked(); assert.equal(await pending, null);
    f.request.result = f.db; f.request.onsuccess(); assert.equal(f.closes, 1); assert.equal(f.timers, 0);
  });
  test(`${module}: silent open has a deadline and late upgrade aborts`, async () => {
    const f = fixture(module); const pending = f.api[read](); f.expire(); assert.equal(await pending, null);
    f.request.result = f.db; f.request.transaction = { abort() { f.db.close(); } };
    f.request.onupgradeneeded(); assert.equal(f.closes, 2);
  });
  test(`${module}: stalled read aborts and ignores late data`, async () => {
    const f = fixture(module); const pending = f.api[read](); f.request.result = f.db; f.request.onsuccess(); await tick();
    f.expire(); assert.equal(await pending, null); assert.equal(f.aborts, 1); assert.equal(f.closes, 1);
    f.operation.result = { data: f.live, ts: Date.now() }; f.operation.onsuccess(); f.tx.oncomplete(); assert.equal(f.closes, 1);
  });
  test(`${module}: cache hit requires transaction completion and closes connection`, async () => {
    const f = fixture(module); const pending = f.api[read](); f.request.result = f.db; f.request.onsuccess(); await tick();
    f.operation.result = { data: f.live, ts: Date.now() }; f.operation.onsuccess(); f.tx.oncomplete();
    assert.deepEqual(await pending, f.live); assert.equal(f.closes, 1); assert.equal(f.timers, 0);
  });
  test(`${module}: stalled write aborts and read abort resolves miss`, async () => {
    const f = fixture(module); const pending = f.api[write](f.live); f.request.result = f.db; f.request.onsuccess(); await tick();
    f.expire(); await pending; assert.equal(f.aborts, 1); assert.equal(f.closes, 1);
    const readPending = f.api[read](); f.request.result = f.db; f.request.onsuccess(); await tick(); f.tx.onabort(); assert.equal(await readPending, null);
  });
  test(`${module}: synchronous storage error is an optional miss`, async () => {
    const f = fixture(module, 'throw'); assert.equal(await f.api[read](), null); assert.equal(f.timers, 0);
  });
}

test('actual Main singleton releases silent cache wait into authenticated live fetch', async () => {
  const f = fixture(); const first = f.api.getAllCached(); const coalesced = f.api.getAllCached(); assert.equal(first, coalesced);
  assert.equal(f.calls, 0); f.expire(); assert.deepEqual(await first, f.live); assert.equal(f.calls, 1);
  assert.deepEqual(await f.api.getAllCached(), f.live); assert.equal(f.calls, 1);
  // Optional background persistence is also bounded.
  f.expire(); await tick();
});

test('actual Instore cache miss releases prefetch into authenticated endpoint', async () => {
  const f = fixture('extendedRange.js'); const pending = f.api.prefetchInstoreCatalogue();
  assert.equal(f.calls, 0);
  for (let count = 0; count < 16; count++) { f.expire(); await tick(); }
  assert.deepEqual(await pending, f.live); assert.equal(f.calls, 1); assert.deepEqual(f.api.instoreCatalogue(), f.live);
});

test('versionchange closes successful connection and thrown transaction misses', async () => {
  const f = fixture(); const opening = f.api.openOptionalCache('synthetic', 1, 'store');
  f.request.result = f.db; f.request.onsuccess(); await opening; f.db.onversionchange(); assert.equal(f.closes, 1);
  assert.equal(await f.api.runOptionalCache({ close() {}, transaction() { throw Error('denied'); } }, 'store', 'readonly', () => {}), null);
});

test('transaction error and request error abort safely; late completion cannot resolve data', async () => {
  for (const event of ['tx', 'request']) {
    const f = fixture(); const pending = f.api.loadFromIndexedCache(); f.request.result = f.db; f.request.onsuccess(); await tick();
    if (event === 'tx') f.tx.onerror(); else f.operation.onerror();
    assert.equal(await pending, null); assert.equal(f.aborts, 1); assert.equal(f.closes, 1);
  }
});

test('upgrade creates missing store, clears existing store, and blocked late upgrade never clears', async () => {
  for (const exists of [false, true]) {
    const f = fixture(); let creates = 0; let clears = 0;
    f.db.objectStoreNames.contains = () => exists; f.db.createObjectStore = () => creates++;
    const pending = f.api.openOptionalCache('synthetic', 1, 'store');
    f.request.result = f.db; f.request.transaction = { objectStore: () => ({ clear() { clears++; } }), abort() {} };
    f.request.onupgradeneeded(); f.request.onsuccess(); await pending;
    assert.equal(creates, exists ? 0 : 1); assert.equal(clears, exists ? 1 : 0);
    const blocked = f.api.openOptionalCache('synthetic', 1, 'store'); f.request.onblocked(); await blocked;
    f.request.result = f.db; f.request.transaction = { objectStore: () => ({ clear() { clears++; } }), abort() {} };
    f.request.onupgradeneeded(); assert.equal(clears, exists ? 1 : 0);
  }
});

function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('Instore invalidation during optional persistence prevents obsolete prefetch return', async () => {
  const f = fixture('extendedRange.js'); const writing = deferred(); let writeStarted = false;
  f.configure({ writing: writing.promise, started: () => { writeStarted = true; } },
    'readPersistedCollection=async()=>null; writePersistedCollection=()=>{started(); return writing;}; clearPersistedCollection=async()=>{};');
  const pending = f.api.prefetchInstoreCatalogue();
  for (let count = 0; count < 16; count++) await tick();
  assert.equal(writeStarted, true); f.api.clearStoredInstoreResponses(); writing.resolve();
  assert.equal(await pending, null); assert.equal(f.api.instoreCatalogue(), null);
});

for (const module of ['products.js', 'extendedRange.js']) {
  test(`${module}: delayed write and obsolete clear opens cannot modify a new lifetime`, async () => {
    const main = module === 'products.js'; const f = fixture(module); let operations = 0;
    const originalTransaction = f.db.transaction;
    f.db.transaction = (...args) => { operations++; return originalTransaction(...args); };
    const write = (main ? f.api.saveToIndexedCache : f.api.writePersistedCollection)(f.live); const writeOpen = f.request;
    const clear = (main ? f.api.clearIndexedCache : f.api.clearPersistedCollection)(); const clearOpen = f.request;
    if (main) f.api.invalidateProductCache(); else f.api.clearStoredInstoreResponses();
    writeOpen.result = f.db; writeOpen.onsuccess(); clearOpen.result = f.db; clearOpen.onsuccess();
    await Promise.all([write, clear]); assert.equal(operations, 0); assert.equal(f.closes, 2);
    f.expire(); await tick();
  });
}

for (const module of ['products.js', 'extendedRange.js']) {
  const main = module === 'products.js';
  test(`${module}: invalidation rejects late persistent rows while new lifetime hydrates`, async () => {
    const f = fixture(module); const old = deferred(); const newer = deferred();
    f.configure({ reads: [old.promise, newer.promise] }, main
      ? 'loadFromPersistentCache=()=>reads.shift(); clearIndexedCache=async()=>{}; saveToIndexedCache=async()=>{};'
      : 'readPersistedCollection=()=>reads.shift(); clearPersistedCollection=async()=>{};');
    const read = () => main ? f.api.getAllCached() : f.api.hydrateInstoreCatalogue();
    const first = read(); const firstResult = first.catch(() => null);
    if (main) f.api.invalidateProductCache(); else f.api.clearStoredInstoreResponses();
    const current = read(); old.resolve([{ id: 'OLD' }]); assert.equal(await firstResult, null);
    assert.equal(main ? f.api.cache() : f.api.instoreCatalogue(), null);
    const expected = [{ id: 'NEW', image: '/synthetic.png' }]; newer.resolve(expected); await current;
    // Main live refresh can replace a persisted first paint with live rows.
    assert.notEqual((main ? f.api.cache() : f.api.instoreCatalogue())?.[0]?.id, 'OLD');
  });
  for (const outcome of ['resolve', 'reject']) {
    test(`${module}: old live ${outcome} cannot publish or clear newer coalesced request`, async () => {
      const f = fixture(module); const old = deferred(); const newer = deferred(); let networkCalls = 0;
      f.configure({ network: () => (++networkCalls === 1 ? old.promise : newer.promise) }, main
        ? 'loadFromPersistentCache=async()=>null; saveToIndexedCache=async()=>{}; clearIndexedCache=async()=>{};'
        : 'readPersistedCollection=async()=>null; writePersistedCollection=async()=>{}; clearPersistedCollection=async()=>{};');
      const load = () => main ? f.api.getAllCached() : f.api.prefetchInstoreCatalogue();
      const first = load(); const firstResult = first.catch(() => null); await tick(); await tick();
      if (main) f.api.invalidateProductCache(); else f.api.clearStoredInstoreResponses();
      const current = load(); await tick(); await tick();
      if (outcome === 'resolve') old.resolve({ response: { ok: true }, data: main ? [{ id: 'OLD' }] : { catalogue: [{ id: 'OLD' }] } });
      else old.reject(Error('Synthetic old failure'));
      await firstResult;
      const coalesced = load(); assert.equal(networkCalls, 2);
      const expected = [{ id: 'NEW', image: '/synthetic.png' }]; newer.resolve({ response: { ok: true }, data: main ? expected : { catalogue: expected } });
      assert.deepEqual(await current, expected); assert.deepEqual(await coalesced, expected);
      assert.deepEqual(main ? f.api.cache() : f.api.instoreCatalogue(), expected);
    });
  }
}
