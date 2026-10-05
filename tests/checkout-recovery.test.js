import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckoutRecoveryHandler } from '../api/checkout-recovery.js';
import { checkoutRequestHash } from '../api/_order-replay.js';
const CUSTOMER = '10000000-0000-4000-8000-000000000001';
const OTHER = '10000000-0000-4000-8000-000000000002';
const ORDER = '20000000-0000-4000-8000-000000000001';
const body = () => ({ clientRef: '30000000-0000-4000-8000-000000000001', deliveryMethod: 'In store pick up', customerNotes: 'synthetic', promoCode: null,
  items: [{ qty: 2, preference: 'Blue', product: { sku: 'SKU1', code: '123', checkoutSnapshot: { unitPrice: 10, stockQty: 30 } } }] });
function fixture() {
  const payload = body(); const calls = [];
  const state = { row: { id: ORDER, order_number: 'TEST001', customer_id: CUSTOMER, client_ref: payload.clientRef,
    checkout_request_hash: checkoutRequestHash(payload), checkout_notification_snapshot: { version: 1, private: 'not returned' } }, error: null, ready: true, bypassFilters: false, throwLookup: false, malformed: false };
  const forbidden = () => { throw new Error('Mutation/provider prohibited'); };
  const db = { storage: new Proxy({}, { get: forbidden }), async rpc(name) { calls.push(['rpc', name]); assert.equal(name, 'order_replay_schema_readiness'); return { data: { contractVersion: 1, ready: state.ready } }; },
    from(table) { assert.equal(table, 'orders'); const filters = [];
      return { insert: forbidden, update: forbidden, delete: forbidden, upsert: forbidden,
        select(columns) { calls.push(['select', columns]); assert(!columns.includes('*')); return this; },
        eq(key, value) { filters.push([key, value]); calls.push(['eq', key, value]); return this; },
        async maybeSingle() { if (state.throwLookup) throw new Error('Lost read reply'); if (state.malformed) return {}; return { data: state.row && (state.bypassFilters || filters.every(([key, value]) => state.row[key] === value)) ? state.row : null, error: state.error }; } }; } };
  const response = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
  const handler = createCheckoutRecoveryHandler({ getDb: () => db, requireAccess: async () => ({ user: { id: CUSTOMER }, customer: { id: CUSTOMER, is_approved: true } }), isPreview: () => false });
  return { state, calls, response, handler, payload };
}
test('exact own protected request returns minimal received receipt with no delivery assertion', async () => {
  const f = fixture(); await f.handler({ method: 'POST', body: f.payload }, f.response);
  assert.deepEqual(f.response.body, { state: 'received', success: true, orderId: ORDER, orderNumber: 'TEST001', deliveryUnchecked: true });
  assert.equal(f.response.headers['Cache-Control'], 'private, no-store');
  assert.equal(f.response.headers.Vary, 'Authorization');
  assert(f.calls.some((c) => c[0] === 'eq' && c[1] === 'customer_id' && c[2] === CUSTOMER));
  assert.equal(f.calls.filter((c) => c[0] === 'rpc').length, 1);
});
for (const kind of ['missing', 'foreign']) test(`${kind} own-reference result never authorizes a fresh reference`, async () => {
  const f = fixture(); if (kind === 'missing') f.state.row = null; else f.state.row.customer_id = OTHER;
  await f.handler({ method: 'POST', body: { ...f.payload, customerId: OTHER } }, f.response);
  assert.deepEqual(f.response.body, { state: 'not_found', safeToStartNew: false, reconciliationRequired: true });
});
for (const patch of [{ checkout_request_hash: null, checkout_notification_snapshot: null }, { checkout_request_hash: 'a'.repeat(64) }, { checkout_notification_snapshot: { version: '1' } }]) test(`historical or mismatched evidence holds ${JSON.stringify(patch)}`, async () => {
  const f = fixture(); Object.assign(f.state.row, patch); await f.handler({ method: 'POST', body: f.payload }, f.response);
  assert.equal(f.response.statusCode, 409); assert.equal(f.response.body.state, 'held'); assert.equal(f.response.body.safeToStartNew, false);
  assert.equal(f.response.body.orderId, undefined);
});
for (const kind of ['readiness', 'query', 'throw']) test(`${kind} unavailable remains held`, async () => {
  const f = fixture(); if (kind === 'readiness') f.state.ready = false; else if (kind === 'query') f.state.error = { message: 'private error' }; else f.state.row = { ...f.state.row, id: null };
  await f.handler({ method: 'POST', body: f.payload }, f.response);
  assert.equal(f.response.statusCode, 503); assert.equal(f.response.body.state, 'held'); assert.equal(f.response.body.safeToStartNew, false);
  assert(!JSON.stringify(f.response.body).includes('private error'));
});
for (const kind of ['missing-payload', 'missing-snapshot', 'quantity', 'oversize', 'bad-ref']) test(`rejects ${kind} before any DB read`, async () => {
  const f = fixture(); let payload = f.payload;
  if (kind === 'missing-payload') payload = null;
  if (kind === 'missing-snapshot') delete payload.items[0].product.checkoutSnapshot;
  if (kind === 'quantity') payload.items[0].qty = 0;
  if (kind === 'oversize') payload.padding = 'x'.repeat(2 * 1024 * 1024);
  if (kind === 'bad-ref') payload.clientRef = '';
  await f.handler({ method: 'POST', body: payload }, f.response);
  assert.equal(f.response.statusCode, 400); assert.equal(f.calls.length, 0);
});
test('auth denial, methods and preview never reach DB', async () => {
  for (const deps of [{ requireAccess: async (_req, res) => { res.status(403).json({ error: 'Approved trade account required' }); return null; } }, { isPreview: () => true }]) {
    const f = fixture(); const handler = createCheckoutRecoveryHandler({ getDb: () => { throw new Error('No DB permitted'); }, ...deps });
    await handler({ method: 'POST', body: f.payload }, f.response); assert.equal(f.response.statusCode, 403);
  }
  const f = fixture(); await f.handler({ method: 'GET' }, f.response); assert.equal(f.response.statusCode, 405); assert.equal(f.calls.length, 0);
});
test('reference match still holds when exact intent changed', async () => {
  const f = fixture(); f.payload.items[0].qty = 3;
  await f.handler({ method: 'POST', body: f.payload }, f.response);
  assert.equal(f.response.statusCode, 409); assert.equal(f.response.body.code, 'ORDER_REFERENCE_CONFLICT');
});

for (const kind of ['foreign-return', 'malformed-return', 'thrown-read']) test(`${kind} cannot establish receipt or strict absence`, async () => {
  const f = fixture();
  if (kind === 'foreign-return') { f.state.row.customer_id = OTHER; f.state.bypassFilters = true; }
  if (kind === 'malformed-return') f.state.malformed = true;
  if (kind === 'thrown-read') f.state.throwLookup = true;
  await f.handler({ method: 'POST', body: f.payload }, f.response);
  assert.equal(f.response.statusCode, 503); assert.equal(f.response.body.state, 'held'); assert.equal(f.response.body.safeToStartNew, false);
});
test('concurrent duplicate read-only checks return same receipt without mutation or delivery', async () => {
  const f = fixture(); const second = { ...f.response, headers: {}, body: null };
  await Promise.all([f.handler({ method: 'POST', body: f.payload }, f.response), f.handler({ method: 'POST', body: f.payload }, second)]);
  assert.deepEqual(second.body, f.response.body); assert.equal(f.calls.filter((c) => c[0] === 'rpc').length, 2);
});
