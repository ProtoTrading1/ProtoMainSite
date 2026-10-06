import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { addBasketLine, mergeBasketLines } from '../lib/basket-lines.mjs';
import { knownCartProductSource, verifiedReorderProduct } from '../src/lib/cartProductRecovery.mjs';
import { itemPreferenceFields } from '../lib/item-preference.mjs';
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const body = source.match(/const handleReorder = ([\s\S]*?\r?\n {2}});/)[1];
const product = id => ({ id, sku: id, code: id, name: id, price: 100, stockQty: 100, source: 'main', isExtendedRange: false });
const line = (id, qty) => ({ product: product(id), qty });
const requested = [{ productId: 'REORDER', code: 'REORDER', source: 'main', isExtendedRange: false, qty: 1 }];
function fixture() {
  let live = [line('KEPT', 2)], release, identity = { userId: 'synthetic-owner' }, queued;
  const lookup = new Promise(resolve => { release = resolve; });
  const currentCartRef = { current: { items: live, activityAt: 1 } };
  const calls = { activity: 0, closes: 0, updates: 0 };
  const context = { captureAuthIdentity: () => identity, customer: { id: identity.userId },
    cartAccountRef: { current: identity.userId }, cartHydratedRef: { current: true },
    cartRevisionRef: { current: 7 }, pendingJournalRef: { current: { raw: null } },
    pendingCheckoutRef: { current: null }, lastCheckoutOptionsRef: { current: null },
    cartConflictRef: { current: false }, cartSyncInFlightRef: { current: false }, currentCartRef,
    canChangeBasket: () => true, fetchProductsBySkus: () => lookup, catalogProducts: [],
    knownCartProductSource, verifiedReorderProduct, mergeBasketLines, addBasketLine, itemPreferenceFields,
    cartQtyCapForProduct: item => item.stockQty, MAX_CART_LINES: 250,
    flushSync: action => action(),
    setCartItems: updater => { calls.updates++; if (queued) { live = queued; queued = undefined; }
      const first = updater(live); const replay = updater(live);
      assert.equal(first, replay, 'pure replayed updater returns deterministic array identity');
      live = first; currentCartRef.current = { ...currentCartRef.current, items: live }; },
    markCartActivity: () => { calls.activity++; }, setReorderModal: () => { calls.closes++; } };
  return { context, calls, reorder: runInNewContext(`(${body})`, context),
    release: () => release(new Map([['REORDER', product('REORDER')]])),
    current: () => live, change: items => { live = items; currentCartRef.current = { ...currentCartRef.current, items }; },
    queue: items => { queued = items; }, switchAccount: () => { identity = { userId: 'synthetic-owner' }; } };
}
test('unchanged deferred reorder commits once and acknowledges committed counts', async () => {
  const f = fixture(); const pending = f.reorder(requested); f.release(); const result = await pending;
  assert.equal(result.added, 1); assert.equal(f.calls.activity, 1); assert.equal(f.calls.closes, 1);
  assert.deepEqual(f.current().map(item => [item.product.id, item.qty]), [['KEPT', 2], ['REORDER', 1]]);
});
for (const [name, items] of [['quantity and added item', [line('KEPT', 9), line('NEW', 4)]], ['clear', []]]) {
  test(`deferred reorder preserves a newer ${name} without reporting added items`, async () => {
    const f = fixture(); const pending = f.reorder(requested); f.change(items); f.release(); const result = await pending;
    assert.equal(result.added, 0); assert.equal(result.held, true); assert.equal(f.current(), items);
    assert.equal(f.calls.activity, 0); assert.equal(f.calls.closes, 0);
  });
}
test('queued React-state edit wins even when published live ref is stale', async () => {
  const f = fixture(); const pending = f.reorder(requested); const newer = [line('KEPT', 9), line('NEW', 4)];
  f.queue(newer); f.release(); const result = await pending;
  assert.equal(result.added, 0); assert.equal(f.current(), newer); assert.equal(f.calls.activity, 0);
});
test('modal abort during lookup prevents any basket or modal publication', async () => {
  const f = fixture(); const controller = new AbortController(); const original = f.current();
  const pending = f.reorder(requested, { signal: controller.signal }); controller.abort(); f.release();
  assert.equal((await pending).added, 0); assert.equal(f.current(), original); assert.equal(f.calls.closes, 0);
});
test('account A-B-A epoch replacement rejects delayed reorder', async () => {
  const f = fixture(); const pending = f.reorder(requested); f.switchAccount(); f.release();
  assert.equal((await pending).added, 0); assert.equal(f.calls.updates, 0);
});
for (const name of ['revision', 'journal', 'pending request', 'checkout options', 'source-only edit', 'conflict', 'in-flight sync']) {
  test(`changed ${name} rejects delayed reorder`, async () => {
    const f = fixture(); const pending = f.reorder(requested);
    if (name === 'revision') f.context.cartRevisionRef.current++;
    if (name === 'journal') f.context.pendingJournalRef.current.raw = 'other';
    if (name === 'pending request') f.context.pendingCheckoutRef.current = { raw: 'other' };
    if (name === 'checkout options') f.context.lastCheckoutOptionsRef.current = { courierChoice: 'own' };
    if (name === 'source-only edit') f.change([{ ...line('KEPT', 2), product: { ...product('KEPT'), source: 'instore', isExtendedRange: true } }]);
    if (name === 'conflict') f.context.cartConflictRef.current = true;
    if (name === 'in-flight sync') f.context.cartSyncInFlightRef.current = true;
    f.release(); const result = await pending;
    assert.equal(result.added, 0); assert.equal(f.calls.activity, 0); assert.equal(f.calls.closes, 0);
  });
}
