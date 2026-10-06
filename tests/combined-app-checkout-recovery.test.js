import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { savedCheckoutSummary } from '../src/lib/checkoutRecoveryClient.mjs';
import * as pendingHelpers from '../src/lib/pendingCheckout.mjs';
import { basketLineKey, mergeBasketLines } from '../lib/basket-lines.mjs';
import { itemPreferenceFields } from '../lib/item-preference.mjs';
import { checkoutSnapshotForProduct } from '../lib/order-stock-guard.mjs';
import { cartProductsNeedReview } from '../src/lib/cartProductRecovery.mjs';
import { archiveUnreadableCart } from '../src/lib/cartStorage.mjs';
import { cartSyncFailure } from '../src/lib/cartSyncRecovery.mjs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const sendSource = app.slice(app.indexOf('  const sendOrderEmail =') + '  const sendOrderEmail ='.length,
  app.indexOf('  const reviewCurrentBasket =')).trim().replace(/;$/, '');
const cleanupSource = app.slice(app.indexOf('  const finishConfirmedCheckoutCleanup =') + '  const finishConfirmedCheckoutCleanup ='.length,
  app.indexOf('  const canChangeBasket =')).trim().replace(/;$/, '');
const hydrationSource = app.slice(app.indexOf('    const hydrate = async () =>') + '    const hydrate ='.length,
  app.indexOf('    cartHydrateRetryRef.current =')).trim().replace(/;$/, '');
const fingerprint = items => JSON.stringify(mergeBasketLines(items).map(item => [basketLineKey(item), Number(item.qty || 0)]));
const ref = current => ({ current });
const line = (qty = 2, price = 10) => ({ qty, preference: 'Blue', product: {
  id: 'ONE', sku: 'ONE', code: 'ONE', name: 'One', source: 'main', isExtendedRange: false,
  price, stockQty: 8, stockOnHand: 8,
} });
const options = { courierChoice: 'pickup', customerNotes: 'Original notes' };

function harness(items = [line()]) {
  const entries = new Map();
  const state = {};
  const calls = { posts: [], clears: 0, newRefs: 0 };
  let currentIdentity = { userId: 'buyer', epoch: 1 };
  const context = {
    ...pendingHelpers, savedCheckoutSummary, itemPreferenceFields, checkoutSnapshotForProduct, cartProductsNeedReview,
    CART_PRODUCT_REVIEW_MESSAGE: 'Review product source',
    customer: { id: 'buyer' }, cartSyncStatus: 'saved',
    navigator: { locks: { request: async (_name, _options, action) => action() } },
    localStorage: { getItem: key => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) },
    captureAuthIdentity: () => currentIdentity,
    assertAuthIdentity: identity => { if (identity !== currentIdentity) {
      const error = new Error('Account changed'); error.code = 'AUTH_ACCOUNT_CHANGED'; throw error;
    } },
    checkoutSendingRef: ref(false), cartHydratedRef: ref(true), cartAccountRef: ref('buyer'),
    cartPreviewModeRef: ref(false), pendingCheckoutRef: ref(null), pendingCheckoutStorageErrorRef: ref(null),
    cartConflictRef: ref(false), cartSyncInFlightRef: ref(false), pendingCartSyncRef: ref(null),
    lastSavedCartRef: ref(fingerprint(items)), cartRevisionRef: ref(7), pendingJournalRef: ref({ raw: null }),
    currentCartRef: ref({ items }), checkoutRefRef: ref(null), lastCheckoutOptionsRef: ref(null),
    lastCheckoutSubmissionRef: ref(null), acceptedCheckoutAttemptRef: ref(null), searchTrackRef: ref({}),
    cartFingerprint: fingerprint, assertPendingSnapshot: () => {},
    getAccountCart: async () => ({ items, revision: 7 }),
    makeClientRef: () => { calls.newRefs++; return 'original-reference'; },
    authHeaders: async () => ({ Authorization: 'Bearer synthetic' }),
    withDeadline: async action => action(),
    requestJson: async (_url, request) => {
      calls.posts.push(JSON.parse(request.body));
      return { success: true, orderId: 'received', orderNumber: 'ORDER-1' };
    },
    clearCart: () => { calls.clears++; },
    trackJourneyEvent: () => {}, trackShoppingEvent: () => {}, logSearchOrder: async () => {},
    fetchLastOrder: async () => null,
  };
  for (const key of ['OrderStatus', 'OrderError', 'OrderChanges', 'SubmittedOrderNumber', 'OrderRecoveryNote',
    'PendingRequestSummary', 'ModalOpen', 'CartStorageIssue', 'CartAnnouncement', 'MobileCartOpen', 'CartDrawerOpen', 'LastOrder']) {
    context[`set${key}`] = value => { state[key] = value; };
  }
  context.setCartItems = update => {
    context.currentCartRef.current.items = update(context.currentCartRef.current.items);
  };
  return { context, entries, state, calls,
    run: (opts = options, retry = false) => vm.runInNewContext(`(${sendSource})`, context)(opts, retry),
    swapIdentity: () => { currentIdentity = { userId: 'buyer', epoch: currentIdentity.epoch + 2 }; },
  };
}

test('actual App refuses a fresh reference when the locked server revision changed', async () => {
  const h = harness();
  h.context.getAccountCart = async () => ({ items: [line()], revision: 8 });
  const result = await h.run();
  assert.equal(result.ok, false);
  assert.equal(h.calls.newRefs, 0);
  assert.equal(h.calls.posts.length, 0);
  assert.equal(pendingHelpers.readPendingCheckout(h.context.localStorage, 'buyer'), null);
});

test('accepted POST with all later storage access denied remains a received-order receipt', async () => {
  const h = harness();
  h.context.requestJson = async (_url, request) => {
    h.calls.posts.push(JSON.parse(request.body));
    h.context.localStorage.getItem = () => { throw new Error('denied'); };
    h.context.localStorage.setItem = () => { throw new Error('denied'); };
    return { success: true, orderId: 'received', orderNumber: 'ORDER-1' };
  };
  assert.equal((await h.run()).ok, true);
  assert.equal(h.state.OrderStatus, 'sent');
  assert.equal(h.calls.clears, 1);
  assert.equal(h.state.CartStorageIssue.code, 'checkout_cleanup');
  assert.equal(JSON.parse(h.entries.get('proto_pending_checkout_v1:buyer')).payload.clientRef, 'original-reference');
  assert.equal(h.context.acceptedCheckoutAttemptRef.current.result.orderId, 'received');
  assert.equal(typeof h.context.acceptedCheckoutAttemptRef.current.raw, 'string');
});

test('uncertain retry sends the captured payload and snapshots even after the basket changes', async () => {
  const h = harness();
  h.context.requestJson = async (_url, request) => {
    h.calls.posts.push(JSON.parse(request.body)); throw new Error('lost response');
  };
  await h.run();
  const original = h.calls.posts[0];
  h.context.currentCartRef.current.items = [line(3, 15)];
  h.context.requestJson = async (_url, request) => {
    h.calls.posts.push(JSON.parse(request.body)); return { success: true, orderId: 'received' };
  };
  assert.equal((await h.run(options, true)).ok, true);
  assert.deepEqual(h.calls.posts[1], original);
  assert.equal(h.calls.newRefs, 1);
  assert.equal(h.calls.clears, 0);
  assert.match(h.state.OrderRecoveryNote, /current basket was kept/);
});

test('first explicit unavailable rejection allows a synced 11-to-8-line amendment with the same reference', async () => {
  const eleven = Array.from({ length: 11 }, (_, index) => ({ ...line(), product: {
    ...line().product, id: `SYNTHETIC-${index}`, sku: `SYNTHETIC-${index}`, code: `SYNTHETIC-${index}`,
  } }));
  const h = harness(eleven);
  h.context.requestJson = async (_url, request) => {
    h.calls.posts.push(JSON.parse(request.body));
    const error = new Error('Product on order line 4 is unavailable.');
    error.status = 400; error.code = 'ORDER_PRODUCT_UNAVAILABLE';
    error.data = { rejectedBeforeCapture: true }; throw error;
  };
  assert.equal((await h.run()).ok, false);
  const first = h.calls.posts[0];
  assert.equal(first.items.length, 11);
  const eight = eleven.slice(0, 8);
  h.context.currentCartRef.current.items = eight;
  h.context.lastSavedCartRef.current = fingerprint(eight);
  h.context.cartRevisionRef.current = 8;
  h.context.getAccountCart = async () => ({ items: eight, revision: 8 });
  h.context.requestJson = async (_url, request) => {
    h.calls.posts.push(JSON.parse(request.body));
    return { success: true, orderId: 'only-amended-order' };
  };
  assert.equal((await h.run()).ok, true);
  assert.equal(h.calls.posts.length, 2);
  assert.equal(h.calls.posts[1].items.length, 8);
  assert.equal(h.calls.posts[1].clientRef, first.clientRef);
  assert.equal(h.calls.newRefs, 1);
});

test('a queued checkout from an earlier A-B-A epoch cannot dispatch or mutate the current receipt', async () => {
  const h = harness();
  h.context.navigator.locks.request = async (_name, _options, action) => {
    h.swapIdentity(); return action();
  };
  assert.equal((await h.run()).ok, false);
  assert.equal(h.calls.posts.length, 0);
  assert.equal(h.calls.newRefs, 0);
  assert.equal(h.state.OrderStatus, undefined);
});

test('generic, unmarked and wrong-status unavailable responses never authorize amendment', async () => {
  for (const fields of [{ status: 400 }, { status: 400, code: 'ORDER_PRODUCT_UNAVAILABLE' },
    { status: 500, code: 'ORDER_PRODUCT_UNAVAILABLE', data: { rejectedBeforeCapture: true } }]) {
    const h = harness();
    h.context.requestJson = async () => { throw Object.assign(new Error('Unavailable'), fields); };
    await h.run();
    assert.notEqual(pendingHelpers.readPendingCheckout(h.context.localStorage, 'buyer').confirmedRejectedBeforeCapture, true);
    h.context.currentCartRef.current.items = [line(3)];
    assert.equal((await h.run()).ok, false);
    assert.equal(h.calls.newRefs, 1);
  }
});

test('unavailable rejection after lost reply preserves exact uncertain payload and reference', async () => {
  const h = harness();
  h.context.requestJson = async (_url, request) => {
    h.calls.posts.push(JSON.parse(request.body)); throw new Error('lost reply');
  };
  await h.run();
  h.context.currentCartRef.current.items = [line(3)];
  h.context.requestJson = async (_url, request) => {
    h.calls.posts.push(JSON.parse(request.body));
    throw Object.assign(new Error('Unavailable'), { status: 400, code: 'ORDER_PRODUCT_UNAVAILABLE',
      data: { rejectedBeforeCapture: true } });
  };
  await h.run(options, true);
  assert.deepEqual(h.calls.posts[1], h.calls.posts[0]);
  assert.equal(pendingHelpers.readPendingCheckout(h.context.localStorage, 'buyer').confirmedRejectedBeforeCapture, false);
  assert.equal((await h.run()).ok, false);
  assert.equal(h.calls.newRefs, 1);
});

test('first definitive review refreshes the matching basket; review after uncertain dispatch keeps it unchanged', async () => {
  const first = harness();
  const review = () => {
    const error = new Error('Review'); error.code = 'ORDER_REVIEW_REQUIRED';
    error.changes = [{ sku: 'ONE', currentPrice: 12, currentStockQty: 6 }]; return error;
  };
  first.context.requestJson = async () => { throw review(); };
  await first.run();
  assert.equal(first.context.currentCartRef.current.items[0].product.price, 12);
  assert.equal(pendingHelpers.readPendingCheckout(first.context.localStorage, 'buyer').confirmedRejectedBeforeCapture, true);
  const uncertain = harness();
  uncertain.context.requestJson = async () => { throw new Error('lost reply'); };
  await uncertain.run();
  uncertain.context.requestJson = async () => { throw review(); };
  await uncertain.run(options, true);
  assert.equal(uncertain.context.currentCartRef.current.items[0].product.price, 10);
  assert.equal(pendingHelpers.readPendingCheckout(uncertain.context.localStorage, 'buyer').confirmedRejectedBeforeCapture, false);
  assert.equal(uncertain.state.OrderChanges.length, 0);
});

test('a first review for the old captured basket never refreshes a newer basket', async () => {
  const h = harness();
  h.context.requestJson = async () => {
    h.context.currentCartRef.current.items = [line(3, 15)];
    const error = new Error('Review'); error.code = 'ORDER_REVIEW_REQUIRED';
    error.changes = [{ sku: 'ONE', currentPrice: 12 }]; throw error;
  };
  await h.run();
  assert.equal(h.context.currentCartRef.current.items[0].product.price, 15);
  assert.equal(h.state.OrderChanges.length, 0);
});

test('reloaded accepted anchor survives clear failure and retires only after a locked DELETE acknowledgement', async () => {
  const h = harness();
  await h.run();
  h.context.currentCartRef.current.items = [];
  h.context.getAccountCart = async () => ({ items: [], revision: 8 });
  h.context.useCallback = callback => callback;
  h.context.confirmedCheckoutCleanupRef = ref(null);
  h.context.readPendingCartRecoveryCopies = () => [];
  h.context.clearAccountCart = async () => { throw new Error('503'); };
  const cleanup = vm.runInNewContext(`(${cleanupSource})`, h.context);
  assert.equal(await cleanup('buyer'), false);
  assert.equal(pendingHelpers.readPendingCheckout(h.context.localStorage, 'buyer').status, 'accepted');
  h.context.clearAccountCart = async revision => ({ items: [], revision: revision + 1 });
  assert.equal(await cleanup('buyer'), true);
  assert.equal(pendingHelpers.readPendingCheckout(h.context.localStorage, 'buyer'), null);
});

test('an acknowledged accepted clear cannot retire its anchor while an immutable recovery copy remains', async () => {
  const h = harness();
  await h.run();
  const attempt = pendingHelpers.readPendingCheckout(h.context.localStorage, 'buyer');
  h.context.useCallback = callback => callback;
  h.context.confirmedCheckoutCleanupRef = ref({ accountId: 'buyer', clientRef: attempt.payload.clientRef,
    fingerprint: attempt.fingerprint });
  h.context.readPendingCartRecoveryCopies = () => [{ raw: 'newer tab evidence' }];
  const cleanup = vm.runInNewContext(`(${cleanupSource})`, h.context);
  assert.equal(await cleanup('buyer'), false);
  assert.equal(pendingHelpers.readPendingCheckout(h.context.localStorage, 'buyer').status, 'accepted');
});

test('actual App hydration preserves denied archive bytes and their device-storage diagnosis before any account request', async () => {
  const h = harness([]);
  h.entries.set('proto_cart', '[null]');
  h.context.localStorage.setItem = () => { throw new Error('Archive quota denied'); };
  let accountRequests = 0;
  let automaticRetries = 0;
  Object.assign(h.context, {
    archiveUnreadableCart, cartSyncFailure, CART_STORAGE_KEY: 'proto_cart', unreadableCanonical: '[null]',
    ownsHydration: () => true, cancelled: false, hydrationInFlight: false, hydrationFailures: 0,
    localItems: [], localActivityAt: null, uid: 'buyer',
    window: { location: { hostname: 'localhost' }, setTimeout: () => { automaticRetries++; } },
    mergeAccountCart: async () => { accountRequests++; return { items: [], revision: 0 }; },
    setCartSyncIssue: issue => { h.state.CartSyncIssue = issue; },
    setCartSyncStatus: status => { h.state.CartSyncStatus = status; },
    setCartLastActivityAt: () => {}, setCartItems: () => {},
  });
  const hydrate = vm.runInNewContext(`(${hydrationSource})`, h.context);
  await hydrate();
  await hydrate();
  assert.equal(h.state.CartSyncIssue.code, 'cart_device_storage');
  assert.equal(h.state.CartSyncIssue.retryable, false);
  assert.equal(h.state.CartSyncStatus, 'error');
  assert.equal(h.context.localStorage.getItem('proto_cart'), '[null]');
  assert.equal(accountRequests, 0);
  assert.equal(automaticRetries, 0);
});
