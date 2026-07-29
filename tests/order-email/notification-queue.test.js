import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  claimNotificationJobs,
  createNotificationQueue,
  enqueueNotificationBatch,
  enqueueNotificationJob,
  nextNotificationTransition,
  notificationIdempotencyKey,
  retryDelayMs,
} from '../../api/_order-notification-queue.js';

function rpcMock(resultFor) {
  const calls = [];
  return {
    calls,
    async rpc(name, args) {
      calls.push({ name, args });
      return resultFor(name, args);
    },
  };
}

test('builds stable idempotency keys from normalized recipient identity', () => {
  const a = notificationIdempotencyKey({
    orderId: 'order-1',
    channel: 'internal_email',
    recipient: 'ONLINE@PROTO.CO.ZA',
  });
  const b = notificationIdempotencyKey({
    orderId: 'order-1',
    channel: 'internal_email',
    recipient: 'online@proto.co.za',
  });
  assert.equal(a, b);
  assert.equal(a, 'order:order-1:internal_email:online%40proto.co.za:v1');
});

test('idempotent enqueue delegates to the database conflict-safe RPC', async () => {
  const existing = { id: 'job-1', status: 'succeeded' };
  const db = rpcMock(() => ({ data: existing, error: null }));
  const input = {
    orderId: 'order-1',
    channel: 'internal_email',
    recipient: 'ONLINE@PROTO.CO.ZA',
    payload: { pdf: true },
  };
  assert.deepEqual(await enqueueNotificationJob(db, input), existing);
  assert.deepEqual(await enqueueNotificationJob(db, input), existing);
  assert.equal(db.calls[0].args.p_idempotency_key, db.calls[1].args.p_idempotency_key);
  assert.equal(db.calls[0].args.p_recipient_key, 'online@proto.co.za');
});

test('batch enqueue uses one atomic RPC and stable replay payload', async () => {
  const replay = [{ id: 'pdf-job' }, { id: 'email-job' }];
  const db = rpcMock(() => ({ data: replay, error: null }));
  const input = {
    orderId: '123e4567-e89b-12d3-a456-426614174000',
    jobs: [
      { channel: 'pdf', recipient: 'system', payload: { orderId: 'one' }, maxAttempts: 3 },
      { channel: 'internal_email', recipient: 'ONLINE@PROTO.CO.ZA', payload: { orderId: 'one' } },
    ],
  };
  assert.deepEqual(await enqueueNotificationBatch(db, input), replay);
  assert.deepEqual(await enqueueNotificationBatch(db, input), replay);
  assert.equal(db.calls.length, 2);
  assert.ok(db.calls.every((call) => call.name === 'enqueue_order_notification_batch'));
  assert.deepEqual(db.calls[0].args, db.calls[1].args);
  assert.equal(db.calls[0].args.p_jobs[1].recipientKey, 'online@proto.co.za');
});

test('claim uses the atomic database claim contract with a bounded lease', async () => {
  const claimed = [{ id: 'job-2', status: 'processing', lease_token: 'lease-1' }];
  const db = rpcMock((name) => ({
    data: name === 'claim_order_notification_jobs' ? claimed : null,
    error: null,
  }));
  assert.deepEqual(await claimNotificationJobs(db, {
    workerId: 'worker-a',
    limit: 5,
    leaseSeconds: 90,
  }), claimed);
  assert.deepEqual(db.calls[0], {
    name: 'claim_order_notification_jobs',
    args: { p_worker_id: 'worker-a', p_limit: 5, p_lease_seconds: 90 },
  });
});

test('worker facade preserves lease ownership for complete, retry, fail and release', async () => {
  const db = rpcMock(() => ({ data: { id: 'job-2' }, error: null }));
  const queue = createNotificationQueue(db);

  await queue.completeNotificationJob('job-2', {
    leaseToken: 'lease-a',
    providerMessageId: 'provider-1',
  });
  await queue.retryNotificationJob('job-2', {
    leaseToken: 'lease-b',
    errorCode: 'timeout',
    errorSummary: 'Provider timed out',
    retryAfterMs: 90_500,
  });
  await queue.failNotificationJob('job-2', {
    leaseToken: 'lease-c',
    errorCode: 'invalid_recipient',
  });
  await queue.releaseNotificationJob('job-2', {
    leaseToken: 'lease-d',
    reason: 'Function time budget reached',
  });

  assert.deepEqual(db.calls.map((call) => call.args.p_succeeded), [true, false, false, false]);
  assert.deepEqual(db.calls.map((call) => call.args.p_retryable), [false, true, false, true]);
  assert.deepEqual(db.calls.map((call) => call.args.p_lease_token), [
    'lease-a', 'lease-b', 'lease-c', 'lease-d',
  ]);
  assert.equal(db.calls[3].args.p_error_code, 'worker_released');
  assert.equal(db.calls[1].args.p_retry_after_seconds, 91);
});

test('retry schedule is bounded and transitions to dead letter at the limit', () => {
  assert.equal(retryDelayMs(1), 60_000);
  assert.equal(retryDelayMs(2), 300_000);
  assert.equal(retryDelayMs(3), 1_200_000);
  assert.equal(retryDelayMs(4), 3_600_000);
  assert.equal(retryDelayMs(99), 21_600_000);

  const now = new Date('2026-07-29T12:00:00.000Z');
  assert.deepEqual(nextNotificationTransition({
    attempt_count: 2,
    max_attempts: 6,
  }, { retryable: true, now }), {
    status: 'retry_wait',
    completedAt: null,
    nextAttemptAt: '2026-07-29T12:05:00.000Z',
  });
  assert.equal(nextNotificationTransition({
    attempt_count: 6,
    max_attempts: 6,
  }, { retryable: true, now }).status, 'dead_letter');
  assert.equal(nextNotificationTransition({
    attempt_count: 1,
    max_attempts: 6,
  }, { retryable: false, now }).status, 'dead_letter');
});

test('migration enforces atomic leases and service-role-only execution', () => {
  const sql = fs.readFileSync(
    new URL('../../migrations/035_order_notification_queue.sql', import.meta.url),
    'utf8',
  );
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /security definer/gi);
  assert.match(sql, /set search_path = ''/gi);
  assert.match(sql, /enable row level security/gi);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/gi);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/gi);
  assert.match(sql, /status = 'processing'[\s\S]+lease_token = gen_random_uuid\(\)/i);
  assert.match(sql, /when p_retryable and v_job\.attempt_count < v_job\.max_attempts then 'retry_wait'/i);
  assert.match(sql, /else 'dead_letter'/i);
  assert.match(sql, /delivery_status text[\s\S]+accepted[\s\S]+delivered[\s\S]+read[\s\S]+failed/i);
  assert.match(sql, /unique index if not exists order_notification_events_provider_event_idx\s+on public\.order_notification_events \(provider, provider_event_id\);/i);
  const eventsTable = sql.match(/create table if not exists public\.order_notification_events \(([\s\S]+?)\n\);/i)?.[1] || '';
  assert.match(eventsTable, /job_id uuid references public\.order_notification_jobs/i);
  assert.match(eventsTable, /order_id uuid references public\.orders/i);
  assert.doesNotMatch(eventsTable, /job_id uuid not null/i);
  assert.doesNotMatch(eventsTable, /order_id uuid not null/i);
  assert.match(sql, /enqueue_order_notification_batch[\s\S]+jsonb_array_elements/i);
  assert.match(sql, /notification_batch_order_mismatch/i);
  assert.match(sql, /on conflict \(idempotency_key\) do nothing/i);
  assert.match(sql, /retry_order_notification_job\(\s*p_job_id uuid,\s*p_actor text,\s*p_reason text/i);
  assert.match(sql, /v_job\.status not in \('dead_letter', 'retry_wait'\)/i);
  assert.match(sql, /set status = 'pending',\s*attempt_count = 0,\s*replay_count = replay_count \+ 1/i);
  assert.match(sql, /'manualReplay', true[\s\S]+'actor', v_actor[\s\S]+'reason', v_reason/i);
  assert.match(sql, /v_actor text := left\([\s\S]+160\)/i);
  assert.match(sql, /v_reason text := left\([\s\S]+500\)/i);
  assert.match(sql, /revoke all on function public\.retry_order_notification_job\(uuid, text, text\)\s+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.retry_order_notification_job\(uuid, text, text\)\s+to service_role/i);
});
