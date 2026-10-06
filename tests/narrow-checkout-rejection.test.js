import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createSendOrderHandler, resolveAuthoritativePrices } from '../api/send-order.js';

test('actual missing-product resolver marks rejection only after two absent same-reference lookups', async () => {
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.VITE_STOCK_SUPABASE_URL;
  const previousKey = process.env.VITE_STOCK_SUPABASE_KEY;
  const previousBrevo = process.env.BREVO_API_KEY;
  process.env.VITE_STOCK_SUPABASE_URL = 'https://synthetic-stock.example.invalid';
  process.env.VITE_STOCK_SUPABASE_KEY = 'synthetic-only';
  process.env.BREVO_API_KEY = 'synthetic-only';
  let stockReads = 0;
  globalThis.fetch = async url => {
    assert.equal(new URL(url).hostname, 'synthetic-stock.example.invalid');
    stockReads++;
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const user = { id: randomUUID() };
    const input = { clientRef: randomUUID(), deliveryMethod: 'In store pick up', customerNotes: '',
      items: [{ qty: 1, product: { sku: 'MISSING', checkoutSnapshot: { unitPrice: 10, stockQty: 20 } } }] };
    await assert.rejects(() => resolveAuthoritativePrices(input.items), error =>
      error.status === 400 && error.code === 'ORDER_PRODUCT_UNAVAILABLE');
    let lookups = 0;
    const filters = [];
    const portal = {
      rpc: async name => {
        assert.ok(['order_delivery_schema_readiness', 'order_replay_schema_readiness'].includes(name));
        return { data: { contractVersion: 1, ready: true } };
      },
      from: table => {
        assert.equal(table, 'orders');
        const query = { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; },
          async maybeSingle() { lookups++; return { data: null }; } };
        return query;
      },
    };
    const handler = createSendOrderHandler({ requireApprovedCustomer: async () => ({ user }),
      getPortalAdminClient: () => portal, resolveAuthoritativePrices });
    const response = { status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }, setHeader() {} };
    await handler({ method: 'POST', body: input }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'ORDER_PRODUCT_UNAVAILABLE');
    assert.equal(response.body.rejectedBeforeCapture, true);
    assert.equal(lookups, 2);
    assert.equal(filters.filter(([key, value]) => key === 'client_ref' && value === input.clientRef).length, 2);
    assert.equal(filters.filter(([key, value]) => key === 'customer_id' && value === user.id).length, 2);
    assert.ok(stockReads >= 2);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.VITE_STOCK_SUPABASE_URL;
    else process.env.VITE_STOCK_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.VITE_STOCK_SUPABASE_KEY;
    else process.env.VITE_STOCK_SUPABASE_KEY = previousKey;
    if (previousBrevo === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = previousBrevo;
  }
});
