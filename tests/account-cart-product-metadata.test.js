import assert from 'node:assert/strict';
import test from 'node:test';
import handler, { parseCartMutation, cartPayload } from '../api/account-cart.js';
import { resolveAuthoritativePrices } from '../api/send-order.js';
import { checkoutSnapshotForProduct, isToOrderProduct } from '../lib/order-stock-guard.mjs';
import { cartProductsNeedReview, recoverCartProducts } from '../src/lib/cartProductRecovery.mjs';

const now = 1_800_000_000_000;
const sku = 'SYNTHETIC-INSTORE-ROUNDTRIP';
const indexRow = { sku, image_source: 'nutstore', barcode: '', title: 'Synthetic Instore bracelet',
  image_url: '', image_review_status: 'verified', visibility_status: 'search_only', is_active: true };
const bridgeRow = { CODE: sku, DESCR: indexRow.title, PRICE_A: 11.74, ONHAND: 12, BOOKED: 1 };

function line(overrides = {}) {
  return { qty: 2, preference: 'Blue if available', product: { id: sku, sku, code: sku,
    name: indexRow.title, price: 0.01, stockOnHand: 999, stockQty: 999,
    isExtendedRange: true, imageSource: 'nutstore', source: 'instore', minQty: 1, unitsOfIssue: 'EACH', ...overrides } };
}

function roundTrip(items) {
  const mutation = parseCartMutation({ mode: 'save', items, activityAt: now, revision: 4 }, { now });
  return cartPayload({ items: mutation.items, activity_at: mutation.activityAt, revision: 5 });
}

function installReadOnlyServices(t, options = {}) {
  const values = { VITE_STOCK_SUPABASE_URL: 'https://stock.synthetic.invalid',
    VITE_STOCK_SUPABASE_KEY: 'synthetic-public-only', STOCK_SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-only',
    STOCK_SQL_BRIDGE_URL: 'https://bridge.synthetic.invalid', STOCK_SQL_BRIDGE_KEY: 'synthetic-bridge-only' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = init.method || input.method || 'GET';
    requests.push({ host: url.host, path: url.pathname, method });
    const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    if (url.origin === values.VITE_STOCK_SUPABASE_URL && method === 'GET') {
      if (url.pathname === '/rest/v1/extended_range_items') return json(options.indexRows ?? [indexRow]);
      if (url.pathname === '/rest/v1/website_stock') return json(options.normalRows ?? []);
      if (url.pathname === '/rest/v1/instore_listing_controls') return json(options.listingRows ?? []);
    }
    if (url.origin === values.VITE_STOCK_SUPABASE_URL && method === 'POST'
      && url.pathname === '/rest/v1/rpc/get_website_product_availability') return json([]);
    if (url.origin === values.STOCK_SQL_BRIDGE_URL && method === 'POST' && url.pathname === '/stmast') {
      assert.equal(JSON.parse(init.body).sku, sku);
      return json({ row: options.bridgeRow ?? bridgeRow });
    }
    throw new Error(`Blocked unmodelled synthetic request: ${method} ${url.origin}${url.pathname}`);
  });
  return requests;
}

test('actual saved-cart serialization preserves selling units, MOQ and Instore routing metadata', () => {
  const original = line({ minQty: 6, unitsOfIssue: 'PACK 12', casePack: 'Pack of 12' });
  original.qty = 6;
  const restored = roundTrip([original]);
  assert.equal(restored.items[0].product.isExtendedRange, true);
  assert.equal(restored.items[0].product.imageSource, 'nutstore');
  assert.equal(restored.items[0].product.source, 'instore');
  assert.equal(restored.items[0].product.minQty, 6);
  assert.equal(restored.items[0].product.unitsOfIssue, 'PACK 12');
  assert.equal(restored.items[0].preference, original.preference);
  assert.equal(restored.items[0].qty, 6);
  assert.equal(restored.revision, 5);
});

test('invalid optional metadata is omitted without manufacturing an Instore or MOQ policy', () => {
  const restored = roundTrip([line({ isExtendedRange: 'true', minQty: 1.5,
    unitsOfIssue: {}, imageSource: 'untrusted-provider', source: 'untrusted-provider' })]);
  for (const field of ['isExtendedRange', 'minQty', 'unitsOfIssue', 'imageSource', 'source']) {
    assert.equal(Object.hasOwn(restored.items[0].product, field), false, field);
  }
});

test('a genuine backorder alias survives storage without changing its original exception', () => {
  const restored = roundTrip([line({ isExtendedRange: false, source: 'main',
    orderable_when_out_of_stock: true, unitsOfIssue: 'Pack of 12' })]);
  assert.equal(isToOrderProduct(restored.items[0].product), true);
  assert.equal(restored.items[0].product.unitsOfIssue, 'PACK 12');
  assert.equal(restored.items[0].product.isExtendedRange, false);
});

test('malformed optional rules never create source, quantity or selling-unit defaults', () => {
  for (const minQty of [0, -1, 1.5, '6', 10000, null]) {
    assert.equal(Object.hasOwn(roundTrip([line({ minQty })]).items[0].product, 'minQty'), false);
  }
  for (const unitsOfIssue of [{}, [], true, false, '', '   ']) {
    assert.equal(Object.hasOwn(roundTrip([line({ unitsOfIssue })]).items[0].product, 'unitsOfIssue'), false);
  }
  const bounded = roundTrip([line({ unitsOfIssue: 'A'.repeat(1000) })]);
  assert.ok(bounded.items[0].product.unitsOfIssue.length <= 40);
  for (const flags of [{ orderableWhenOutOfStock: true, orderable_when_out_of_stock: false },
    { orderableWhenOutOfStock: false, orderable_when_out_of_stock: true }]) {
    assert.equal(isToOrderProduct(roundTrip([line(flags)]).items[0].product), true);
  }
  const falseFlag = roundTrip([line({ orderableWhenOutOfStock: false })]).items[0].product;
  assert.equal(falseFlag.orderableWhenOutOfStock, false);
  assert.equal(isToOrderProduct(falseFlag), false);
});

test('an already-stripped legacy row remains unresolved instead of guessing its product source', async t => {
  const requests = installReadOnlyServices(t);
  // Exact historical snapshot shape: the previous sanitizer retained these
  // fields but erased source/unit/minimum metadata before database persistence.
  const legacy = { product: { id: sku, sku, code: sku, name: indexRow.title, price: 0.01,
    stockOnHand: 999, stockQty: 999, inStock: true, toOrder: false, to_order: false }, qty: 2 };
  const restored = cartPayload({ items: [legacy], activity_at: now, revision: 4 });
  for (const field of ['isExtendedRange', 'minQty', 'unitsOfIssue', 'imageSource', 'source']) {
    assert.equal(Object.hasOwn(restored.items[0].product, field), false, field);
  }
  await assert.rejects(resolveAuthoritativePrices(restored.items), error => {
    assert.equal(error.status, 400);
    assert.match(error.message, /unavailable/);
    return true;
  });
  assert.equal(requests.some(request => request.path === '/rest/v1/extended_range_items'), false);
});

test('an unresolved serialized Instore line with a submitted strict source hint reaches the actual fresh resolver', async t => {
  const requests = installReadOnlyServices(t);
  const restored = roundTrip([line()]);
  // Match the browser submission contract: the hint selects a resolver, while
  // the reviewed index and fresh bridge still determine eligibility and price.
  const submitted = restored.items.map(item => ({ qty: item.qty, preference: item.preference,
    product: { id: item.product.id, sku: item.product.sku, code: item.product.code, name: item.product.name,
      ...(item.product.isExtendedRange === true ? { isExtendedRange: true } : {}),
      checkoutSnapshot: checkoutSnapshotForProduct(item.product) } }));
  await assert.rejects(resolveAuthoritativePrices(submitted), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'ORDER_REVIEW_REQUIRED');
    assert.equal(error.changes[0].sku, sku);
    assert.equal(error.changes[0].currentPrice, 13.5);
    assert.equal(error.changes[0].currentStockQty, 11);
    assert.equal(error.changes[0].priceChanged, true);
    assert.equal(error.changes[0].stockChanged, true);
    return true;
  });
  // The stale restored snapshot cannot silently consent. Model the customer's
  // explicit review with the freshly returned snapshot, keeping intent intact.
  submitted[0].product.checkoutSnapshot = { unitPrice: 13.5, stockQty: 11 };
  const result = await resolveAuthoritativePrices(submitted);
  assert.equal(result[0].product.isExtendedRange, true);
  assert.equal(result[0].product.sku, sku);
  assert.equal(result[0].product.price, 13.5, 'stored browser price cannot become authoritative');
  assert.equal(result[0].product.unitsOfIssue, 'EACH');
  assert.equal(result[0].qty, 2);
  assert.equal(result[0].preference, 'Blue if available');
  assert.ok(requests.some(request => request.path === '/rest/v1/extended_range_items'));
  assert.ok(requests.some(request => request.path === '/stmast'));
});

test('persisted claimed Instore source cannot bypass inactive or unreviewed live index records', async t => {
  const requests = installReadOnlyServices(t, { indexRows: [{ ...indexRow, is_active: false, image_review_status: 'unverified' }] });
  await assert.rejects(resolveAuthoritativePrices(roundTrip([line()]).items), error => {
    assert.equal(error.status, 409);
    assert.match(error.message, /no longer approved/);
    return true;
  });
  assert.ok(requests.some(request => request.path === '/rest/v1/extended_range_items'));
});

test('persisted claimed stock cannot bypass the fresh aggregate Instore stock cap', async t => {
  installReadOnlyServices(t);
  const first = line(); first.qty = 6;
  const second = line(); second.qty = 6; second.preference = 'Green if available';
  await assert.rejects(resolveAuthoritativePrices(roundTrip([first, second]).items), error => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'ORDER_REVIEW_REQUIRED');
    assert.ok(error.changes.length > 0);
    for (const change of error.changes) {
      assert.equal(change.sku, sku);
      assert.equal(change.currentStockQty, 11);
      assert.equal(change.requestedQty, 12);
      assert.equal(change.quantityExceedsStock, true);
    }
    return true;
  });
  // Reviewing the fresh snapshot cannot override aggregate physical stock.
  const reviewed = roundTrip([first, second]).items.map(item => ({ ...item,
    product: { ...item.product, checkoutSnapshot: { unitPrice: 13.5, stockQty: 11 } } }));
  await assert.rejects(resolveAuthoritativePrices(reviewed), error => {
    assert.equal(error.code, 'ORDER_REVIEW_REQUIRED');
    assert.equal(error.changes[0].priceChanged, false);
    assert.equal(error.changes[0].stockChanged, false);
    assert.equal(error.changes[0].requestedQty, 12);
    assert.equal(error.changes[0].quantityExceedsStock, true);
    return true;
  });
});

test('persisted claimed Instore source cannot bypass a main-catalogue duplicate', async t => {
  installReadOnlyServices(t, { normalRows: [{ sku, barcode: '' }] });
  await assert.rejects(resolveAuthoritativePrices(roundTrip([line()]).items), error => {
    assert.equal(error.status, 409);
    assert.match(error.message, /already listed in the main catalogue/);
    return true;
  });
});

test('normal serialized products still use authoritative MOQ and selling units', async t => {
  installReadOnlyServices(t, { normalRows: [{ sku, barcode: sku, title: 'Synthetic pack', price: 25,
    units_of_issue: 'PACK 12', min_order_qty: 6, stock_qty: 100, available_stock: 100, to_order: false }] });
  const original = line({ isExtendedRange: false, minQty: 1, unitsOfIssue: 'EACH', price: 25,
    checkoutSnapshot: { unitPrice: 25, stockQty: 100 } });
  // The snapshot is supplied at checkout, after basket serialization.
  const restored = roundTrip([original]);
  restored.items[0].product.checkoutSnapshot = { unitPrice: 25, stockQty: 100 };
  await assert.rejects(resolveAuthoritativePrices(restored.items), error => {
    assert.equal(error.status, 400);
    assert.match(error.message, /minimum order of 6/);
    return true;
  });
  restored.items[0].qty = 6;
  const result = await resolveAuthoritativePrices(restored.items);
  assert.equal(result[0].product.minQty, 6);
  assert.equal(result[0].product.unitsOfIssue, 'PACK 12');
  assert.equal(result[0].product.price, 25);
});

test('actual account-cart SDK handler roundtrip retains metadata and PR262 merge/revision contracts', async t => {
  const values = { VITE_SUPABASE_URL: 'https://portal.synthetic.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-only', VERCEL_ENV: 'production' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const customerId = 'synthetic-approved-account';
  let row = null;
  let writes = 0;
  const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    const method = init.method || input.method || 'GET';
    assert.equal(url.origin, values.VITE_SUPABASE_URL, 'unmodelled requests cannot leave synthetic service');
    if (url.pathname === '/auth/v1/user' && method === 'GET') return json({ id: customerId });
    if (url.pathname === '/rest/v1/customers' && method === 'GET') {
      assert.equal(url.searchParams.get('id'), `eq.${customerId}`);
      return json([{ id: customerId, role: 'customer', is_approved: true,
        trade_email_verification_required: true, trade_email_verified_at: '2026-10-03T00:00:00Z' }]);
    }
    if (url.pathname === '/rest/v1/customer_account_carts') {
      if (method === 'GET') {
        assert.equal(url.searchParams.get('customer_id'), `eq.${customerId}`);
        return json(row ? [row] : []);
      }
      if (method === 'POST' || method === 'PATCH') {
        const data = JSON.parse(init.body);
        if (method === 'POST') assert.equal(data.customer_id, customerId);
        if (method === 'PATCH') {
          assert.equal(url.searchParams.get('customer_id'), `eq.${customerId}`);
          assert.equal(url.searchParams.get('revision'), `eq.${row.revision}`, 'update keeps revision compare-and-swap');
        }
        writes += 1;
        row = { ...row, ...data };
        return json(method === 'POST' ? row : [row]);
      }
    }
    throw new Error(`Blocked unmodelled synthetic request: ${method} ${url.pathname}`);
  });
  async function request(method, body) {
    const response = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
    await handler({ method, body, headers: { authorization: 'Bearer synthetic-token', host: 'localhost' } }, response);
    return response;
  }
  const original = line({ minQty: 6, unitsOfIssue: 'Pack of 12', orderable_when_out_of_stock: true });
  original.qty = 6;
  const first = await request('PUT', { mode: 'merge', items: [original], activityAt: now });
  assert.equal(first.statusCode, 200);
  assert.equal(first.data.revision, 1);
  assert.equal(first.data.items[0].product.source, 'instore');
  assert.equal(first.data.items[0].product.isExtendedRange, true);
  assert.equal(first.data.items[0].product.minQty, 6);
  assert.equal(first.data.items[0].product.unitsOfIssue, 'PACK 12');
  assert.equal(first.data.items[0].product.orderableWhenOutOfStock, true);
  const loaded = await request('GET');
  assert.deepEqual(loaded.data, first.data);
  assert.equal(loaded.headers['Cache-Control'], 'private, no-store');

  const importAttempt = await request('PUT', { mode: 'merge', items: [line({ source: 'main', isExtendedRange: false })], activityAt: now });
  assert.deepEqual(importAttempt.data, first.data, 'login merge retains established account basket');
  assert.equal(writes, 1);
  const variants = [original, { ...original, qty: 7, preference: 'Green' }];
  const saved = await request('PUT', { mode: 'save', items: variants, revision: 1, activityAt: now });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.data.revision, 2);
  assert.deepEqual(saved.data.items.map(item => item.qty), [6, 7]);
  assert.deepEqual(saved.data.items.map(item => item.preference), ['Blue if available', 'Green']);
  const stale = await request('PUT', { mode: 'save', items: [], revision: 1, activityAt: now });
  assert.equal(stale.statusCode, 409);
  assert.deepEqual(stale.data.items, saved.data.items);
  assert.equal(writes, 2);

  // Existing rows may predate canonical preference identity. All quantities
  // survive, but the first line must not bless conflicting source metadata.
  row.items = [{ ...line({ source: 'main', isExtendedRange: false }), qty: 4, preference: ' Blue ' },
    { ...line(), qty: 5, preference: 'blue' }];
  const repaired = await request('GET');
  assert.equal(repaired.data.items.length, 1);
  assert.equal(repaired.data.items[0].qty, 9);
  assert.equal(cartProductsNeedReview(repaired.data.items), true);
  assert.equal(cartProductsNeedReview(recoverCartProducts(repaired.data.items, new Map([[sku, { code: sku, source: 'main' }]]))), true);
  assert.equal(writes, 2, 'GET never rewrites a historical account basket');
});

test('mixed historical provenance remains blocked after API sanitization and a second roundtrip', () => {
  const first = cartPayload({ items: [{ ...line({ source: 'main', isExtendedRange: false }), qty: 4 },
    { ...line(), qty: 5 }], activity_at: now, revision: 4 });
  assert.equal(first.items[0].qty, 9);
  const restored = roundTrip(first.items);
  assert.equal(restored.items[0].qty, 9);
  assert.equal(cartProductsNeedReview(restored.items), true);
  assert.equal(restored.items[0].product.source, undefined);
  assert.equal(restored.items[0].product.isExtendedRange, undefined);
});
