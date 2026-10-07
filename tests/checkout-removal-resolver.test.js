import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthoritativePrices } from '../api/send-order.js';

test('actual resolver uses one incoming observation, preserves unknowns and original mixed-source indices', async () => {
  const oldFetch = globalThis.fetch;
  const names = ['VITE_STOCK_SUPABASE_URL', 'VITE_STOCK_SUPABASE_KEY', 'STOCK_SUPABASE_SERVICE_ROLE_KEY', 'STOCK_SQL_BRIDGE_URL', 'STOCK_SQL_BRIDGE_KEY'];
  const oldEnv = new Map(names.map(name => [name, process.env[name]]));
  process.env.VITE_STOCK_SUPABASE_URL = 'https://synthetic-stock.example.invalid';
  process.env.VITE_STOCK_SUPABASE_KEY = process.env.STOCK_SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  process.env.STOCK_SQL_BRIDGE_URL = 'https://synthetic-bridge.example.invalid';
  process.env.STOCK_SQL_BRIDGE_KEY = 'synthetic-only';
  const baseRow = { sku: 'TK2154-GLD', barcode: '123', title: '21st Birthday Key — Queen Crown', price: 428, units_of_issue: 'EACH', stock_qty: 0, available_stock: 0, to_order: false };
  let row = baseRow, incoming = [], incomingStatus = 200, rpcCalls = 0, duplicate = false;
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    assert.ok(['synthetic-stock.example.invalid', 'synthetic-bridge.example.invalid'].includes(parsed.hostname));
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    if (parsed.pathname.endsWith('/stmast')) return json({ row: { CODE: 'INSTORE', DESCR: 'Available Instore', PRICE_A: 20, ONHAND: 30, BOOKED: 0 } });
    if (parsed.pathname.endsWith('/rpc/get_website_product_availability')) { rpcCalls++; return json(incoming, incomingStatus); }
    if (parsed.pathname.endsWith('/extended_range_items')) return json([{ sku: 'INSTORE', image_source: 'nutstore', image_review_status: 'verified', visibility_status: 'search_only', is_active: true }]);
    if (parsed.pathname.endsWith('/instore_listing_controls')) return json([]);
    assert.ok(parsed.pathname.endsWith('/website_stock'));
    if ((parsed.searchParams.get('sku') || parsed.searchParams.get('barcode') || '').includes('INSTORE')) return json([]);
    return json(duplicate ? [row, row] : [row]);
  };
  const main = { qty: 1, preference: ' Gold ', product: { id: 'TK2154-GLD', sku: 'TK2154-GLD', code: '123', stockRemovalSource: 'main', checkoutSnapshot: { unitPrice: 428, stockQty: 8 } } };
  async function review(items = [main]) {
    rpcCalls = 0;
    let caught;
    try { await resolveAuthoritativePrices(items); } catch (error) { caught = error; }
    assert.equal(caught?.code, 'ORDER_REVIEW_REQUIRED');
    assert.equal(rpcCalls, 1, 'same RPC observation feeds normal projection and deletion eligibility');
    return caught.changes.find(change => change.sku === 'TK2154-GLD');
  }
  try {
    const mixed = [{ qty: 1, product: { id: 'INSTORE', sku: 'INSTORE', isExtendedRange: true } }, main];
    const original = JSON.stringify(mixed);
    const change = await review(mixed);
    assert.deepEqual(change.removalProof, { eligible: true, source: 'main', lineIndex: 1, productId: 'TK2154-GLD', sku: 'TK2154-GLD', code: '123', qty: 1, preference: 'Gold' });
    assert.equal(JSON.stringify(mixed), original, 'request and capture item shape remain untouched');
    for (const raw of [undefined, null, -1, 0.5, 12]) {
      row = { ...baseRow, available_stock: raw };
      assert.equal((await review()).removalProof.eligible, false);
    }
    row = baseRow;
    incoming = { code: 'PGRST202', message: 'missing RPC' }; incomingStatus = 404;
    assert.equal((await review()).removalProof.eligible, false);
    incomingStatus = 200;
    for (const data of [null, [{ sku: row.sku, incoming_status: 'bad', incoming_qty: 0, incoming_eta: null, allow_preorder: false }]]) {
      incoming = data;
      assert.equal((await review()).removalProof.eligible, false);
    }
    incoming = [{ sku: row.sku, incoming_status: 'on_the_way', incoming_qty: 12, incoming_eta: null, allow_preorder: true }];
    const preorder = await review();
    assert.equal(preorder.stockOrderable, true);
    assert.equal(preorder.removalProof.eligible, false);
    incoming = []; duplicate = true;
    assert.equal((await review()).removalProof.eligible, false);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of oldEnv) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
