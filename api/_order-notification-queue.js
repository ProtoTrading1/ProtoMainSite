const RETRY_DELAYS_MS = Object.freeze([
  60_000,
  5 * 60_000,
  20 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
]);

export const NOTIFICATION_CHANNELS = Object.freeze([
  'pdf',
  'internal_email',
  'customer_email',
]);

export function normalizeNotificationRecipient(channel, recipient) {
  const value = String(recipient || '').trim();
  if (channel === 'pdf') return 'system';
  return value.toLowerCase();
}

export function notificationIdempotencyKey({
  orderId,
  channel,
  recipient,
  version = 1,
}) {
  if (!orderId) throw new Error('orderId is required');
  if (!NOTIFICATION_CHANNELS.includes(channel)) {
    throw new Error(`Unsupported notification channel: ${channel}`);
  }
  const recipientKey = normalizeNotificationRecipient(channel, recipient);
  if (!recipientKey) throw new Error('recipient is required');
  return `order:${orderId}:${channel}:${encodeURIComponent(recipientKey)}:v${version}`;
}

export function retryDelayMs(attemptCount) {
  const attempt = Math.max(1, Number(attemptCount) || 1);
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
}

export function nextNotificationTransition(job, {
  succeeded = false,
  retryable = false,
  now = new Date(),
} = {}) {
  const attemptCount = Number(job?.attempt_count || 0);
  const maxAttempts = Number(job?.max_attempts || 6);
  if (succeeded) {
    return { status: 'succeeded', completedAt: new Date(now).toISOString(), nextAttemptAt: null };
  }
  if (retryable && attemptCount < maxAttempts) {
    return {
      status: 'retry_wait',
      completedAt: null,
      nextAttemptAt: new Date(new Date(now).getTime() + retryDelayMs(attemptCount)).toISOString(),
    };
  }
  return { status: 'dead_letter', completedAt: new Date(now).toISOString(), nextAttemptAt: null };
}

function rpcError(error, operation) {
  if (!error) return;
  throw new Error(`${operation}: ${error.message || String(error)}`);
}

export async function enqueueNotificationJob(supabase, {
  orderId,
  channel,
  recipient,
  recipientName = '',
  payload = {},
  maxAttempts = 6,
  version = 1,
}) {
  const recipientKey = normalizeNotificationRecipient(channel, recipient);
  const idempotencyKey = notificationIdempotencyKey({
    orderId,
    channel,
    recipient: recipientKey,
    version,
  });
  const { data, error } = await supabase.rpc('enqueue_order_notification_job', {
    p_order_id: orderId,
    p_channel: channel,
    p_recipient_key: recipientKey,
    p_recipient_name: recipientName,
    p_payload: payload,
    p_max_attempts: maxAttempts,
    p_idempotency_key: idempotencyKey,
  });
  rpcError(error, 'Could not enqueue order notification');
  return Array.isArray(data) ? data[0] : data;
}

export async function enqueueNotificationBatch(supabase, {
  orderId,
  jobs,
}) {
  if (!orderId) throw new Error('orderId is required');
  if (!Array.isArray(jobs) || jobs.length === 0) throw new Error('jobs are required');
  const normalized = jobs.map((job) => {
    const recipientKey = normalizeNotificationRecipient(job.channel, job.recipient);
    return {
      orderId,
      channel: job.channel,
      recipientKey,
      recipientName: job.recipientName || '',
      payload: job.payload || {},
      maxAttempts: job.maxAttempts || 6,
      idempotencyKey: notificationIdempotencyKey({
        orderId,
        channel: job.channel,
        recipient: recipientKey,
        version: job.version || 1,
      }),
    };
  });
  const { data, error } = await supabase.rpc('enqueue_order_notification_batch', {
    p_order_id: orderId,
    p_jobs: normalized,
  });
  rpcError(error, 'Could not enqueue order notification batch');
  return Array.isArray(data) ? data : [];
}

export async function claimNotificationJobs(supabase, {
  workerId,
  limit = 5,
  leaseSeconds = 90,
}) {
  if (!workerId) throw new Error('workerId is required');
  const { data, error } = await supabase.rpc('claim_order_notification_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  rpcError(error, 'Could not claim order notifications');
  return Array.isArray(data) ? data : [];
}

export async function finishNotificationJob(supabase, job, outcome = {}) {
  if (!job?.id || !job?.lease_token) throw new Error('A claimed job and lease token are required');
  const { data, error } = await supabase.rpc('finish_order_notification_job', {
    p_job_id: job.id,
    p_lease_token: job.lease_token,
    p_succeeded: outcome.succeeded === true,
    p_retryable: outcome.retryable === true,
    p_provider: outcome.provider || null,
    p_provider_message_id: outcome.providerMessageId || null,
    p_provider_status: outcome.providerStatus ?? null,
    p_error_code: outcome.errorCode || null,
    p_error: outcome.error || null,
    p_next_attempt_at: outcome.availableAt || null,
    p_retry_after_seconds: Number.isFinite(Number(outcome.retryAfterMs))
      ? Math.max(1, Math.ceil(Number(outcome.retryAfterMs) / 1000))
      : null,
  });
  rpcError(error, 'Could not finish order notification');
  return Array.isArray(data) ? data[0] : data;
}

export async function requeueStaleNotificationJobs(supabase) {
  const { data, error } = await supabase.rpc('requeue_stale_notification_jobs');
  rpcError(error, 'Could not requeue stale order notifications');
  return Number(data || 0);
}

/**
 * Worker-facing facade. Every terminal transition requires the lease token
 * returned by claimNotificationJobs, preventing an expired worker from
 * completing a job claimed by a newer invocation.
 */
export function createNotificationQueue(supabase) {
  const finish = (id, {
    leaseToken,
    succeeded,
    retryable,
    provider,
    providerMessageId,
    providerStatus,
    httpStatus,
    errorCode,
    errorSummary,
    availableAt,
    retryAfterMs,
  } = {}) => finishNotificationJob(supabase, {
    id,
    lease_token: leaseToken,
  }, {
    succeeded,
    retryable,
    provider,
    providerMessageId,
    providerStatus: providerStatus ?? httpStatus,
    errorCode,
    error: errorSummary,
    availableAt,
    retryAfterMs,
  });

  return {
    enqueueNotificationJob: (input) => enqueueNotificationJob(supabase, input),
    enqueueNotificationBatch: (input) => enqueueNotificationBatch(supabase, input),
    claimNotificationJobs: (input) => claimNotificationJobs(supabase, input),
    completeNotificationJob: (id, outcome = {}) => finish(id, {
      ...outcome,
      succeeded: true,
      retryable: false,
    }),
    retryNotificationJob: (id, outcome = {}) => finish(id, {
      ...outcome,
      succeeded: false,
      retryable: true,
    }),
    failNotificationJob: (id, outcome = {}) => finish(id, {
      ...outcome,
      succeeded: false,
      retryable: false,
    }),
    // A release is a retryable transition. The database calculates the next
    // bounded retry time and retains the reason in the immutable event audit.
    releaseNotificationJob: (id, { reason, ...outcome } = {}) => finish(id, {
      ...outcome,
      errorCode: outcome.errorCode || 'worker_released',
      errorSummary: reason || outcome.errorSummary || 'Worker released the job',
      succeeded: false,
      retryable: true,
    }),
    requeueStaleNotificationJobs: () => requeueStaleNotificationJobs(supabase),
  };
}
