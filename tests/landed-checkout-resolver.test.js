import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthoritativePrices } from '../api/send-order.js';

const row = { sku: '8616000132W', barcode: 'SYNTHETIC-BARCODE', title: 'SYNTHETIC ARRIVED PACK', price: 49.5, units_of_issue: 'Pack of 50', min_order_qty: 1, available_stock: -23, stock_qty: -23, to_order: false };
const marker = { sku: row.sku, incoming_status: 'landed_awaiting_grv', incoming_qty: 0.001 };
const item = { qty: 1, product: { sku: row.sku, price: 0.01, availability: { state: 'landed', canOrder: true, incomingStatus: 'landed_awaiting_grv', incomingQty: 52 }, checkoutSnapshot: { unitPrice: 49.5, stockQty: 0 } } };

async function resolve(items, { stock = row, incoming = [marker] } = {}) {
  const oldFetch = globalThis.fetch;
  const oldUrl = process.env.VITE_STOCK_SUPABASE_URL;
  const oldKey = process.env.VITE_STOCK_SUPABASE_KEY;
  process.env.VITE_STOCK_SUPABASE_URL = 'https://synthetic-checkout.invalid';
  process.env.VITE_STOCK_SUPABASE_KEY = 'synthetic-public-placeholder';
  globalThis.fetch = async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.hostname, 'synthetic-checkout.invalid');
    const data = url.pathname.endsWith('/website_stock') ? [stock]
      : url.pathname.endsWith('/get_website_product_availability') ? incoming : null;
    assert.notEqual(data, null, `Unexpected synthetic source path: ${url.pathname}`);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    return await resolveAuthoritativePrices(items, { classify: async () => new Set() });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.VITE_STOCK_SUPABASE_URL; else process.env.VITE_STOCK_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.VITE_STOCK_SUPABASE_KEY; else process.env.VITE_STOCK_SUPABASE_KEY = oldKey;
  }
}

test('authoritative resolver accepts landed negative-POS requests and SKU aliases without inventing stock', async () => {
  const resolved = await resolve([item, { ...item, qty: 2, preference: 'White', product: { ...item.product, sku: '', code: row.barcode } }]);
  assert.equal(resolved.length, 2);
  assert.deepEqual(resolved.map(line => line.qty), [1, 2]);
  assert.equal(resolved[0].product.price, 49.5);
  assert.equal(resolved[0].product.availabilityLabel, 'Stock available');
  assert.equal(resolved[0].product.unitsOfIssue, 'PACK 50');
  assert.equal(row.available_stock, -23);
  assert.equal(marker.incoming_qty, 0.001);
});

test('browser availability cannot grant a request without an authoritative arrived marker', async () => {
  for (const incoming of [[], [{ ...marker, incoming_qty: 0 }], [{ ...marker, incoming_status: 'partially_received' }], [{ ...marker, incoming_status: 'customs' }]]) {
    await assert.rejects(() => resolve([item], { incoming }), error => error.code === 'ORDER_REVIEW_REQUIRED' && error.changes[0].quantityExceedsStock);
  }
  await assert.rejects(() => resolve([item], { stock: { ...row, available_stock: null, stock_qty: null } }), { code: 'ORDER_REVIEW_REQUIRED' });
});

test('positive POS stock keeps aggregate cap and landed requests retain authoritative price review', async () => {
  const positive = { ...row, available_stock: 2, stock_qty: 2 };
  const snap = { ...item.product, checkoutSnapshot: { unitPrice: 49.5, stockQty: 2 } };
  await assert.rejects(() => resolve([{ qty: 2, product: snap }, { qty: 1, product: snap }], { stock: positive }), error => error.code === 'ORDER_REVIEW_REQUIRED' && error.changes[0].requestedQty === 3);
  await assert.rejects(() => resolve([item], { stock: { ...row, price: 50 } }), error => error.code === 'ORDER_REVIEW_REQUIRED' && error.changes[0].priceChanged);
});
