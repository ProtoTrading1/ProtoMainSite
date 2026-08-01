import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertOrderCaptureSchemaReady,
  durableQueueGate,
  enqueueFailedOrderDeliveries,
  OrderDeliverySchemaError,
  readOrderDeliveryReadiness,
} from '../api/_order-delivery-safety.js';
import { captureOrderRow } from '../api/send-order.js';

const sendOrderSource = fs.readFileSync(new URL('../api/send-order.js', import.meta.url), 'utf8');
const migrationSource = fs.readFileSync(new URL('../migrations/058_order_delivery_safety.sql', import.meta.url), 'utf8');

test('checkout no longer deletes client_ref or retries an unprotected insert', () => {
  assert.doesNotMatch(sendOrderSource, /delete withoutRef\.client_ref/);
  assert.doesNotMatch(sendOrderSource, /const withoutRef = \{ \.\.\.insertRow \}/);
  assert.match(sendOrderSource, /await assertOrderCaptureSchemaReady\(portal\)/);
  assert.match(sendOrderSource, /ORDER_CAPTURE_SCHEMA_NOT_READY/);
});

test('capture aborts on a missing client_ref column without attempting an insert', async () => {
  let insertCalled = false;
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() {
      return {
        data: null,
        error: { code: 'PGRST204', message: "Could not find the 'client_ref' column" },
      };
    },
    insert() { insertCalled = true; return this; },
    single() { return this; },
  };

  await assert.rejects(
    () => captureOrderRow({
      supabase: { from: () => query },
      userId: '81bd9093-e750-4261-89c2-19688a24f105',
      items: [{ qty: 1, product: { id: 'SKU-1', code: '1', name: 'Item', price: 10 } }],
      subtotal: 10,
      deliveryMethod: 'In store pick up',
      customerNotes: '',
      promo: null,
      clientRef: '42276df4-df31-4b15-8dc6-96dd81dc739f',
    }),
    (error) => error instanceof OrderDeliverySchemaError
      && error.code === 'ORDER_CAPTURE_SCHEMA_NOT_READY',
  );
  assert.equal(insertCalled, false);
});

test('schema readiness requires the versioned client_ref column and unique-index contract', async () => {
  const readyClient = {
    rpc: async () => ({
      data: {
        contractVersion: 1,
        ready: true,
        clientRefColumn: true,
        clientRefUnique: true,
        queueReady: true,
      },
      error: null,
    }),
  };
  const result = await readOrderDeliveryReadiness(readyClient);
  assert.equal(result.ready, true);
  assert.equal(result.clientRefUnique, true);
  await assert.doesNotReject(() => assertOrderCaptureSchemaReady(readyClient));

  const staleClient = {
    rpc: async () => ({ data: null, error: { message: 'function is missing' } }),
  };
  await assert.rejects(
    () => assertOrderCaptureSchemaReady(staleClient),
    (error) => error instanceof OrderDeliverySchemaError
      && error.code === 'ORDER_CAPTURE_SCHEMA_NOT_READY'
      && error.status === 503,
  );
});

test('durable queue cannot activate without all three explicit gates', () => {
  const activation = '2026-08-01T10:00:00.000Z';
  assert.equal(durableQueueGate({}).enabled, false);
  assert.equal(durableQueueGate({ ORDER_DELIVERY_QUEUE_ENABLED: 'true' }).reason, 'worker-not-ready');
  assert.equal(durableQueueGate({
    ORDER_DELIVERY_QUEUE_ENABLED: 'true',
    ORDER_DELIVERY_QUEUE_WORKER_READY: 'true',
  }).reason, 'activation-time-missing');
  assert.equal(durableQueueGate({
    ORDER_DELIVERY_QUEUE_ENABLED: 'true',
    ORDER_DELIVERY_QUEUE_WORKER_READY: 'true',
    ORDER_DELIVERY_QUEUE_ACTIVATION_AT: activation,
  }).enabled, true);
});

test('queue rejects pre-activation orders and never scans existing orders', async () => {
  let fromCalled = false;
  const supabase = { from: () => { fromCalled = true; throw new Error('must not write'); } };
  const result = await enqueueFailedOrderDeliveries({
    supabase,
    orderId: 'afe3131a-a22a-44d5-9e22-00bf009b398a',
    orderCreatedAt: '2026-08-01T09:59:59.000Z',
    failures: [{ channel: 'team_email' }],
    env: {
      ORDER_DELIVERY_QUEUE_ENABLED: 'true',
      ORDER_DELIVERY_QUEUE_WORKER_READY: 'true',
      ORDER_DELIVERY_QUEUE_ACTIVATION_AT: '2026-08-01T10:00:00.000Z',
    },
  });
  assert.deepEqual(result, { queued: false, count: 0, reason: 'order-before-activation' });
  assert.equal(fromCalled, false);
  assert.doesNotMatch(sendOrderSource, /from\(['"]orders['"]\).*\.select\([^)]*created_at/si);
});

test('queue insert is idempotent per current order and delivery channel', async () => {
  let observed = null;
  const supabase = {
    from(table) {
      assert.equal(table, 'order_delivery_jobs');
      return {
        async upsert(rows, options) {
          observed = { rows, options };
          return { error: null };
        },
      };
    },
  };
  const result = await enqueueFailedOrderDeliveries({
    supabase,
    orderId: 'afe3131a-a22a-44d5-9e22-00bf009b398a',
    orderCreatedAt: '2026-08-01T10:00:01.000Z',
    failures: [
      { channel: 'team_email' },
      { channel: 'team_email' },
      { channel: 'unsupported' },
      { channel: 'pdf' },
    ],
    env: {
      ORDER_DELIVERY_QUEUE_ENABLED: 'true',
      ORDER_DELIVERY_QUEUE_WORKER_READY: 'true',
      ORDER_DELIVERY_QUEUE_ACTIVATION_AT: '2026-08-01T10:00:00.000Z',
    },
  });
  assert.deepEqual(result, { queued: true, count: 2, reason: null });
  assert.deepEqual(observed.options, { onConflict: 'order_id,channel', ignoreDuplicates: true });
  assert.deepEqual(observed.rows.map((row) => row.channel), ['team_email', 'pdf']);
  assert.ok(observed.rows.every((row) => row.source === 'storefront-v2'));
});

test('migration is inert, private to service_role, leased, bounded and dead-lettered', () => {
  assert.match(migrationSource, /unique \(order_id, channel\)/i);
  assert.match(migrationSource, /enable row level security/i);
  assert.match(migrationSource, /revoke all on table public\.order_delivery_jobs from public, anon, authenticated/i);
  assert.match(migrationSource, /grant select, insert, update on table public\.order_delivery_jobs to service_role/i);
  assert.match(migrationSource, /for update skip locked/i);
  assert.match(migrationSource, /attempt_count >= max_attempts then 'dead'/i);
  assert.match(migrationSource, /order_created_at >= p_activation_at/i);
  assert.doesNotMatch(migrationSource, /create\s+trigger/i);
  assert.doesNotMatch(migrationSource, /insert\s+into\s+public\.order_delivery_jobs\s+select/i);
});
