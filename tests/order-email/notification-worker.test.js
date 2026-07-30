import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateInternalEmailPdf,
  isNotificationWorkerAuthorized,
  runNotificationWorker,
  writeWorkerHeartbeat,
} from '../../api/order-notification-worker.js';
import { NotificationProviderError } from '../../api/_notification-provider.js';

function queueDb(jobs = []) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        async upsert(row, options) {
          calls.push({ name: 'upsert', table, row, options });
          return { data: row, error: null };
        },
      };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'requeue_stale_notification_jobs') return { data: 0, error: null };
      if (name === 'claim_order_notification_jobs') return { data: jobs, error: null };
      if (name === 'finish_order_notification_job') return { data: { id: args.p_job_id }, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
}

test('internal email PDF is hydrated from storage without regenerating it', async () => {
  let generated = false;
  const hydrated = await hydrateInternalEmailPdf({
    id: 'mail-1',
    order_id: 'order-1',
    channel: 'internal_email',
    payload: {
      orderId: 'order-1',
      orderNumber: 'PT_00100',
      requiresPdf: true,
      to: { email: 'online@proto.co.za' },
      subject: 'Order',
      htmlContent: '<p>Order</p>',
    },
  }, {
    downloadPdf: async () => Buffer.from('stored-pdf'),
    generatePdf: async () => {
      generated = true;
      return { buffer: Buffer.from('generated-pdf') };
    },
  });
  assert.equal(generated, false);
  assert.equal(hydrated.payload.attachment.length, 1);
  assert.equal(hydrated.payload.attachment[0].name, 'proto-order-PT_00100.pdf');
  assert.equal(
    Buffer.from(hydrated.payload.attachment[0].content, 'base64').toString(),
    'stored-pdf',
  );
});

test('missing stored PDF is generated in the worker and oversized PDFs fail permanently', async () => {
  let generated = 0;
  const job = {
    id: 'mail-1',
    order_id: 'order-1',
    channel: 'internal_email',
    payload: { orderId: 'order-1', requiresPdf: true },
  };
  const hydrated = await hydrateInternalEmailPdf(job, {
    downloadPdf: async () => null,
    generatePdf: async () => {
      generated += 1;
      return { buffer: Buffer.from('generated-pdf') };
    },
  });
  assert.equal(generated, 1);
  assert.equal(
    Buffer.from(hydrated.payload.attachment[0].content, 'base64').toString(),
    'generated-pdf',
  );

  await assert.rejects(() => hydrateInternalEmailPdf(job, {
    downloadPdf: async () => Buffer.alloc(4 * 1024 * 1024 + 1),
    generatePdf: async () => ({ buffer: Buffer.from('unused') }),
  }), (error) => error.code === 'pdf_too_large' && error.retryable === false);
});

test('heartbeat writes start/end state and tolerates a missing rollout table', async () => {
  const db = queueDb([]);
  assert.equal(await writeWorkerHeartbeat(db, {
    workerId: 'worker-1',
    status: 'running',
    startedAt: 1000,
    summary: { claimed: 0 },
  }), true);
  const upsert = db.calls.find((call) => call.name === 'upsert');
  assert.equal(upsert.table, 'order_notification_worker_heartbeats');
  assert.equal(upsert.row.status, 'running');
  assert.equal(upsert.options.onConflict, 'worker_id');

  const missingDb = {
    from() {
      return {
        async upsert() {
          return { error: { code: '42P01', message: 'relation does not exist' } };
        },
      };
    },
  };
  assert.equal(await writeWorkerHeartbeat(missingDb, {
    workerId: 'worker-2',
    status: 'running',
    startedAt: 1000,
  }), true);
});

test('cron authorization fails closed and uses bearer CRON_SECRET', () => {
  const before = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal(isNotificationWorkerAuthorized({ headers: { authorization: 'Bearer anything' } }), false);
  process.env.CRON_SECRET = 'secret-value';
  assert.equal(isNotificationWorkerAuthorized({ headers: {} }), false);
  assert.equal(isNotificationWorkerAuthorized({ headers: { authorization: 'Bearer wrong' } }), false);
  assert.equal(isNotificationWorkerAuthorized({ headers: { authorization: 'Bearer secret-value' } }), true);
  if (before == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = before;
});

test('worker claims a bounded batch and finishes each recipient job independently', async () => {
  const db = queueDb([
    { id: 'mail-1', order_id: 'o-1', channel: 'internal_email', attempt_count: 1, max_attempts: 6, lease_token: 'l-1' },
    { id: 'mail-2', order_id: 'o-1', channel: 'customer_email', attempt_count: 1, max_attempts: 6, lease_token: 'l-2' },
  ]);
  const result = await runNotificationWorker({
    supabase: db,
    workerId: 'test-worker',
    now: () => 1000,
    dispatch: async (job) => {
      if (job.id === 'mail-2') {
        throw new NotificationProviderError('Brevo busy', {
          code: 'provider_transient',
          httpStatus: 429,
          retryable: true,
          retryAfterMs: 120000,
        });
      }
      return { state: 'accepted', provider: 'brevo', providerMessageId: 'msg-1', httpStatus: 200 };
    },
  });
  assert.equal(result.accepted, 1);
  assert.equal(result.retried, 1);
  const finishes = db.calls.filter((call) => call.name === 'finish_order_notification_job');
  assert.equal(finishes.length, 2);
  assert.equal(finishes[0].args.p_job_id, 'mail-1');
  assert.equal(finishes[0].args.p_succeeded, true);
  assert.equal(finishes[1].args.p_job_id, 'mail-2');
  assert.equal(finishes[1].args.p_retryable, true);
  assert.equal(finishes[1].args.p_retry_after_seconds, 120);
  const heartbeats = db.calls.filter((call) => call.name === 'upsert');
  assert.deepEqual(heartbeats.map((call) => call.row.status), ['running', 'completed']);
});

test('permanent provider failures go directly to dead letter', async () => {
  const db = queueDb([
    { id: 'mail-1', order_id: 'o-1', channel: 'internal_email', attempt_count: 1, max_attempts: 6, lease_token: 'l-1' },
  ]);
  const result = await runNotificationWorker({
    supabase: db,
    now: () => 1000,
    dispatch: async () => {
      throw new NotificationProviderError('Bad request', {
        code: 'provider_rejected',
        httpStatus: 400,
        retryable: false,
      });
    },
  });
  assert.equal(result.deadLettered, 1);
  const finish = db.calls.find((call) => call.name === 'finish_order_notification_job');
  assert.equal(finish.args.p_retryable, false);
  assert.equal(finish.args.p_error_code, 'provider_rejected');
});

test('worker never reports accepted email work as delivered', async () => {
  const db = queueDb([
    { id: 'mail-1', order_id: 'o-1', channel: 'customer_email', attempt_count: 1, max_attempts: 6, lease_token: 'l-1' },
  ]);
  const result = await runNotificationWorker({
    supabase: db,
    now: () => 1000,
    dispatch: async () => ({
      state: 'accepted',
      provider: 'brevo',
      providerMessageId: 'brevo-message',
      httpStatus: 200,
    }),
  });
  assert.equal(result.results[0].state, 'accepted');
  assert.notEqual(result.results[0].state, 'delivered');
});
