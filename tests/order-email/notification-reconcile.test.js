import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNotificationReconcileAuthorized,
  runNotificationReconcile,
} from '../../api/order-notification-reconcile.js';

test('reconcile authorization fails closed and requires CRON_SECRET bearer auth', () => {
  const before = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(isNotificationReconcileAuthorized({
    headers: { authorization: 'Bearer anything' },
  }), false);
  process.env.CRON_SECRET = 'reconcile-secret';
  assert.equal(isNotificationReconcileAuthorized({ headers: {} }), false);
  assert.equal(isNotificationReconcileAuthorized({
    headers: { authorization: 'Bearer wrong' },
  }), false);
  assert.equal(isNotificationReconcileAuthorized({
    headers: { authorization: 'Bearer reconcile-secret' },
  }), true);
  if (before == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = before;
});

test('an order saved before enqueue was interrupted is recovered', async () => {
  const enqueued = [];
  let pages = 0;
  const result = await runNotificationReconcile({
    now: () => Date.parse('2026-07-29T12:00:00.000Z'),
    listOrders: async () => {
      pages += 1;
      return pages === 1
        ? [{ id: 'order-lost', order_number: 'PT_00100', created_at: '2026-07-29T10:00:00.000Z' }]
        : [];
    },
    listQueued: async () => new Set(),
    enqueue: async (orderId) => {
      enqueued.push(orderId);
      return [{ id: 'pdf' }, { id: 'email' }];
    },
  });
  assert.deepEqual(enqueued, ['order-lost']);
  assert.equal(result.recovered, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.results[0].queued, 2);
});

test('orders already represented in the queue are skipped without dispatching', async () => {
  let enqueueCalls = 0;
  let pages = 0;
  const result = await runNotificationReconcile({
    now: () => Date.parse('2026-07-29T12:00:00.000Z'),
    listOrders: async () => {
      pages += 1;
      return pages === 1
        ? [{ id: 'order-ok', order_number: 'PT_00099', created_at: '2026-07-29T09:00:00.000Z' }]
        : [];
    },
    listQueued: async () => new Set(['order-ok']),
    enqueue: async () => {
      enqueueCalls += 1;
      throw new Error('must not send or enqueue');
    },
  });
  assert.equal(enqueueCalls, 0);
  assert.equal(result.skippedWithJobs, 1);
  assert.equal(result.recovered, 0);
});

test('bounded oldest-first pagination advances past healthy orders', async () => {
  const seenCursors = [];
  const enqueued = [];
  const pages = [
    Array.from({ length: 25 }, (_, index) => ({
      id: `healthy-${String(index).padStart(2, '0')}`,
      created_at: `2026-07-28T10:${String(index).padStart(2, '0')}:00.000Z`,
    })),
    [{ id: 'missing-later', created_at: '2026-07-29T10:00:00.000Z' }],
  ];
  let pageIndex = 0;
  const result = await runNotificationReconcile({
    now: () => Date.parse('2026-07-29T12:00:00.000Z'),
    listOrders: async ({ cursor }) => {
      seenCursors.push(cursor);
      return pages[pageIndex++] || [];
    },
    listQueued: async (ids) => (
      ids.includes('missing-later') ? new Set() : new Set(ids)
    ),
    enqueue: async (orderId) => {
      enqueued.push(orderId);
      return [{ id: 'job' }];
    },
  });
  assert.equal(seenCursors.length, 2);
  assert.equal(seenCursors[1].id, 'healthy-24');
  assert.deepEqual(enqueued, ['missing-later']);
  assert.equal(result.scanned, 26);
  assert.equal(result.recovered, 1);
});

test('reconciliation calls only the idempotent enqueue boundary, never providers', async () => {
  const calls = [];
  let pages = 0;
  await runNotificationReconcile({
    now: () => Date.parse('2026-07-29T12:00:00.000Z'),
    listOrders: async () => {
      pages += 1;
      return pages === 1
        ? [{ id: 'order-1', created_at: '2026-07-29T10:00:00.000Z' }]
        : [];
    },
    listQueued: async () => new Set(),
    enqueue: async (orderId) => {
      calls.push({ type: 'enqueue', orderId });
      return [];
    },
  });
  assert.deepEqual(calls, [{ type: 'enqueue', orderId: 'order-1' }]);
});
