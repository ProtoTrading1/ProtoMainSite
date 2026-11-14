import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthoritativePrices, captureOrderRow, buildOrderEmailHtml } from '../api/send-order.js';
import { evaluateCheckoutSnapshot } from '../lib/order-stock-guard.mjs';
import { stockRequestNote } from '../lib/stock-request-note.mjs';
import { stockAdvisoryForQty } from '../src/lib/stockAdvisory.js';

const row = { sku: 'TEST-SHORTAGE', barcode: 'TEST-ONLY', title: 'Synthetic product', price: 10, units_of_issue: 'EACH', min_order_qty: 1, available_stock: 0, stock_qty: 0, to_order: false };
const item = { qty: 4, preference: 'Blue', product: { sku: row.sku, checkoutSnapshot: { unitPrice: 10, stockQty: 5 }, stockRequest: { availableQty: 999 } } };
async function resolve(stock = row, incoming = [], items = [item]) {
  const before = { fetch: globalThis.fetch, url: process.env.VITE_STOCK_SUPABASE_URL, key: process.env.VITE_STOCK_SUPABASE_KEY };
  process.env.VITE_STOCK_SUPABASE_URL = 'https://synthetic-checkout.invalid';
  process.env.VITE_STOCK_SUPABASE_KEY = 'synthetic';
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.hostname, 'synthetic-checkout.invalid');
    const data = url.pathname.endsWith('/website_stock') ? (stock ? [stock] : []) : url.pathname.endsWith('/get_website_product_availability') ? incoming : null;
    assert.notEqual(data, null);
    return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  };
  try { return await resolveAuthoritativePrices(items, { classify: async () => new Set() }); }
  finally {
    globalThis.fetch = before.fetch;
    for (const [name, value] of [['VITE_STOCK_SUPABASE_URL', before.url], ['VITE_STOCK_SUPABASE_KEY', before.key]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

test('zero/negative and partial stock accept exact basket quantities with server-derived warnings', async () => {
  for (const stock of [0, -3, 2]) {
    const resolved = await resolve({ ...row, available_stock: stock, stock_qty: stock });
    assert.equal(resolved[0].qty, 4);
    assert.equal(resolved[0].preference, 'Blue');
    assert.equal(resolved[0].product.price, 10);
    assert.deepEqual(resolved[0].product.stockRequest, { availableQty: Math.max(0, stock), requestedQty: 4, shortfallQty: 4 - Math.max(0, stock), sharedStock: false });
    assert.match(stockRequestNote(resolved[0].product), /not guaranteed/);
  }
  assert.equal((await resolve({ ...row, available_stock: 10, stock_qty: 10 }))[0].product.stockRequest, undefined);
});

test('unknown stock, missing product, changed price, invalid quantity and MOQ remain protected', async () => {
  await assert.rejects(() => resolve({ ...row, available_stock: null, stock_qty: null }), { code: 'ORDER_REVIEW_REQUIRED' });
  await assert.rejects(() => resolve(null), /unavailable/);
  await assert.rejects(() => resolve({ ...row, price: 20 }), error => error.code === 'ORDER_REVIEW_REQUIRED' && error.changes[0].priceChanged && !error.changes[0].quantityExceedsStock);
  await assert.rejects(() => resolve({ ...row, min_order_qty: 5 }), /minimum order/);
  await assert.rejects(() => resolve(row, [], [{ ...item, qty: 0 }]), /Invalid quantity/);
  await assert.rejects(() => resolve(row, [{ sku: row.sku, incoming_status: 'customs', incoming_qty: 20, allow_preorder: false }]), { status: 409 });
});

test('snapshot policy opts in only for known stock and does not waive prices', () => {
  const data = { quantity: 4, submittedSnapshot: { unitPrice: 10, stockQty: 5 }, currentPrice: 10, currentStockQty: 0, allowKnownStockRequests: true };
  assert.equal(evaluateCheckoutSnapshot(data), null);
  assert.equal(evaluateCheckoutSnapshot({ ...data, currentPrice: 20 }).priceChanged, true);
  assert.equal(evaluateCheckoutSnapshot({ ...data, currentStockQty: null }).stockUnavailable, true);
});

test('saved order and original snapshot carry shortages, Admin note and email expose them', async () => {
  const items = await resolve();
  let inserted;
  const supabase = { from(table) { assert.equal(table, 'orders'); return { insert(rows) { inserted = rows[0]; return { select() { return { async single() { return { data: { id: 'synthetic', ...inserted } }; } }; } }; } }; } };
  const captured = await captureOrderRow({ supabase, userId: 'synthetic-user', items, subtotal: 40, deliveryMethod: 'In store pick up', customerNotes: 'Customer text', notificationSnapshot: { version: 1, items } });
  assert.equal(captured.items.length, 1);
  assert.equal(captured.items[0].qty, 4);
  assert.deepEqual(captured.items, captured.original_items);
  assert.equal(captured.customer_notes, 'Customer text');
  assert.match(captured.order_change_notes, /TEST-SHORTAGE: Out of stock/);
  assert.equal(captured.items[0].stockRequest.shortfallQty, 4);
  const html = buildOrderEmailHtml({ audience: 'team', orderNumber: 'SYNTHETIC', customer: {}, items, totals: { subtotal: 40, total: 40 }, deliveryMethod: 'In store pick up' });
  assert.match(html, /Out of stock: 0 available, 4 requested/);
  assert.match(html, /availability and delivery are not guaranteed/);
});

test('basket warning includes zero and negative stock without advising quantity removal', () => {
  assert.equal(stockAdvisoryForQty({ stockOnHand: 0 }, 4).shortfall, 4);
  assert.equal(stockAdvisoryForQty({ stockOnHand: -3 }, 4).availableStock, 0);
  assert.equal(stockAdvisoryForQty({ stockOnHand: null }, 4).isOverOrder, false);
});

test('actual basket hydration preserves a line that becomes unavailable and hands it to checkout', async () => {
  const { readFileSync } = await import('node:fs');
  const { mergeBasketLines, updateBasketLineQuantity, basketLineKey } = await import('../lib/basket-lines.mjs');
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const start = app.indexOf('async function hydrateAccountCartItems(items)');
  const end = app.indexOf('\nfunction makeCartSyncOperation', start);
  assert.ok(start >= 0 && end > start);
  const live = { ...item.product, id: row.sku, price: 10, stockOnHand: 0, stockQty: 0, inStock: false, canOrder: false };
  const hydrate = new Function('mergeBasketLines', 'fetchProductsBySkus', 'TURTLE_BRACELET_COLOURS', 'withTurtleBraceletPhoto',
    app.slice(start, end) + '; return hydrateAccountCartItems;')(mergeBasketLines, async () => new Map([[row.sku, live]]), [], p => p);
  const saved = [{ ...item, product: { ...item.product, stockOnHand: 5, inStock: true } }];
  const refreshed = await hydrate(saved);
  assert.equal(refreshed.length, 1);
  assert.equal(refreshed[0].qty, 4);
  assert.equal(refreshed[0].preference, 'Blue');
  assert.equal(refreshed[0].product.stockOnHand, 0);
  assert.equal(stockAdvisoryForQty(refreshed[0].product, refreshed[0].qty).shortfall, 4);
  const edited = updateBasketLineQuantity(refreshed, basketLineKey(refreshed[0]), 3, () => 0);
  assert.equal(edited.length, 1);
  assert.equal(edited[0].qty, 4);
  const canonical = await resolve(row, [], refreshed);
  assert.equal(canonical[0].qty, 4);
  assert.equal(canonical[0].product.stockRequest.shortfallQty, 4);
});
