import test from 'node:test';
import assert from 'node:assert/strict';
import { createSortOrdersHandler } from '../api/sort-orders.js';

const legacy = { orders: { stationery: { skuOrder: ['OTHER'] }, 'collection:just-added': { skuOrder: ['STALE'], updatedAt: 'old' } }, updatedAt: 'storage-token' };

async function read(response, throws = false) {
  const calls = [];
  const client = {
    from(table) { calls.push(['from', table]); return this; },
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    async maybeSingle() { if (throws) throw new Error('offline'); return response; },
  };
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await createSortOrdersHandler({ readStore: async () => legacy, getClient: () => client })({ method: 'GET' }, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(res.body.orders.stationery, legacy.orders.stationery);
  assert.equal(res.body.updatedAt, legacy.updatedAt);
  assert.deepEqual(legacy.orders['collection:just-added'].skuOrder, ['STALE']);
  assert.deepEqual(calls, [['from', 'just_added_order_state'], ['select', 'sku_order,updated_at'], ['eq', 'id', true]]);
  return res.body.orders['collection:just-added'];
}

test('atomic order replaces only Just Added and preserves the opaque revision', async () => {
  assert.deepEqual(await read({ data: { sku_order: ['B', 'A'], updated_at: 'order:revision' }, error: null }), { skuOrder: ['B', 'A'], updatedAt: 'order:revision' });
});

test('valid empty atomic order is available, including an initial null revision', async () => {
  assert.deepEqual(await read({ data: { sku_order: [], updated_at: null }, error: null }), { skuOrder: [], updatedAt: null });
});

for (const [name, response, throws] of [
  ['missing table', { data: null, error: { code: '42P01' } }],
  ['missing row', { data: null, error: null }],
  ['database error', { data: null, error: { message: 'offline' } }],
  ['thrown error', null, true],
  ['duplicate SKU', { data: { sku_order: ['A', 'A'], updated_at: 'v' } }],
  ['untrimmed SKU', { data: { sku_order: [' A'], updated_at: 'v' } }],
  ['invalid revision', { data: { sku_order: [], updated_at: '' } }],
]) test(`${name} fails only Just Added without stale legacy fallback`, async () => {
  assert.deepEqual(await read(response, throws), { skuOrder: [], updatedAt: null, unavailable: true });
});
