import test from 'node:test';
import assert from 'node:assert/strict';
import { createShoppingEventsHandler } from '../api/shopping-events.js';
const body = { eventId: 'f2761d6e-01fb-4c67-b6e9-b418c829035f', sessionId: 'ed130931-a3f5-4207-bd1f-25989291ce03', eventType: 'catalogue_viewed', source: 'main', customerId: 'spoof', isInternal: false };
function res() { return { statusCode: 200, setHeader() {}, status(n) { this.statusCode = n; return this; }, json(value) { this.body = value; return this; } }; }
function dependencies(error = null, order = null) { const captured = []; const filters = []; return { captured, filters, authorize: async () => ({ user: { id: 'actual', app_metadata: { role: 'staff' } }, customer: {} }), rateLimit: async () => ({ allowed: true }), client: () => ({ from: table => ({ insert: async row => { captured.push(row); return { error }; }, select() { return this; }, eq(column, value) { filters.push({ table, column, value }); return this; }, maybeSingle: async () => ({ data: order }) }) }) }; }
test('server owns identity/exclusions, missing schema is explicit, retries are idempotent', async () => {
 for (const [error, expected] of [[null, { ok: true }], [{ code: '42P01' }, { ok: true, skipped: true, reason: 'schema_unavailable' }], [{ code: 'PGRST205' }, { ok: true, skipped: true, reason: 'schema_unavailable' }], [{ code: '23505' }, { ok: true, duplicate: true }]]) {
  const deps = dependencies(error); const response = res();
  await createShoppingEventsHandler(deps)({ method: 'POST', headers: {}, body }, response);
  assert.deepEqual(response.body, expected); assert.equal(deps.captured[0].customer_id, 'actual'); assert.equal(deps.captured[0].is_internal, true); assert.equal(deps.captured[0].created_at, undefined);
 }
});
test('invalid auth, arbitrary orders and rate limited events never insert', async () => {
 const deps = dependencies();
 const denied = res(); await createShoppingEventsHandler({ ...deps, authorize: async () => null })({ method: 'POST', headers: {}, body }, denied); assert.equal(deps.captured.length, 0);
 const order = res(); await createShoppingEventsHandler(deps)({ method: 'POST', headers: {}, body: { ...body, eventType: 'order_submitted', orderId: body.eventId } }, order); assert.equal(order.statusCode, 400); assert.equal(deps.captured.length, 0);
 const limited = res(); await createShoppingEventsHandler({ ...deps, rateLimit: async () => ({ allowed: false }) })({ method: 'POST', headers: {}, body }, limited); assert.equal(limited.body.reason, 'rate_limit'); assert.equal(deps.captured.length, 0);
});

test('owned order attribution retains server environment across preview and production despite client spoofing', async () => {
 const original = process.env.VERCEL_ENV;
 const orderId = body.eventId;
 try {
  for (const [environment, eventId] of [['preview', body.eventId], ['production', body.sessionId]]) {
   process.env.VERCEL_ENV = environment;
   const deps = dependencies(null, { id: orderId }); const response = res();
   await createShoppingEventsHandler(deps)({ method: 'POST', headers: {}, body: { ...body, eventId, eventType: 'order_submitted', orderId, environment: environment === 'production' ? 'preview' : 'production' } }, response);
   assert.deepEqual(response.body, { ok: true });
   assert.equal(deps.captured[0].environment, environment);
   assert.equal(deps.captured[0].order_id, orderId);
   assert.equal(deps.captured[0].customer_id, 'actual');
   assert.deepEqual(deps.filters, [{ table: 'orders', column: 'id', value: orderId }, { table: 'orders', column: 'customer_id', value: 'actual' }]);
  }
 } finally { if (original === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = original; }
});
