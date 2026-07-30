import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createNotificationQueue } from './_order-notification-queue.js';
import { deliverNotificationJob, NotificationProviderError } from './_notification-provider.js';
import { retryDelayMs, shouldRetryJob } from './_notification-retry.js';
import { downloadStoredOrderPdf, generateAndStoreOrderPdf } from './_order-pdf.js';

const WORKER_BUDGET_MS = 45_000;
const CLAIM_LIMIT = 5;
const LEASE_SECONDS = 90;
const MIN_DISPATCH_BUDGET_MS = 13_000;
export const MAX_EMAIL_PDF_BYTES = 4 * 1024 * 1024;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function isNotificationWorkerAuthorized(req) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  const provided = String(req?.headers?.authorization || '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  return Boolean(expected) && safeEqual(provided, expected);
}

function getQueueClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Notification queue database is not configured');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function hydrateInternalEmailPdf(job, {
  downloadPdf = downloadStoredOrderPdf,
  generatePdf = generateAndStoreOrderPdf,
} = {}) {
  const payload = job?.payload ?? job?.payload_json ?? {};
  if (job?.channel !== 'internal_email' || payload?.requiresPdf !== true) return job;

  const orderId = String(payload.orderId || job.order_id || '').trim();
  if (!orderId) {
    throw new NotificationProviderError('Internal email PDF job has no order ID', {
      code: 'invalid_job_payload',
      retryable: false,
    });
  }

  let pdf = await downloadPdf(orderId);
  if (!pdf?.length) {
    const generated = await generatePdf(orderId);
    pdf = generated?.buffer;
  }
  if (!pdf?.length) {
    throw new NotificationProviderError('Order PDF could not be prepared', {
      code: 'pdf_unavailable',
      retryable: true,
    });
  }
  if (pdf.length > MAX_EMAIL_PDF_BYTES) {
    throw new NotificationProviderError('Order PDF exceeds the 4 MB email attachment limit', {
      code: 'pdf_too_large',
      retryable: false,
    });
  }

  const safeRef = String(payload.orderNumber || orderId)
    .replace(/[^a-z0-9_-]+/gi, '-')
    .slice(0, 80);
  const attachment = (Array.isArray(payload.attachment) ? payload.attachment : [])
    .filter((item) => item?.name !== `proto-order-${safeRef}.pdf`);
  attachment.push({
    name: `proto-order-${safeRef}.pdf`,
    content: Buffer.from(pdf).toString('base64'),
  });

  return {
    ...job,
    payload: {
      ...payload,
      attachment,
    },
  };
}

async function dispatchJob(job, options) {
  if (job.channel === 'pdf') {
    const result = await generateAndStoreOrderPdf(job.order_id);
    return {
      state: 'accepted',
      provider: 'supabase-storage',
      providerMessageId: null,
      httpStatus: 200,
      pdfStored: Boolean(result),
    };
  }
  return deliverNotificationJob(await hydrateInternalEmailPdf(job), options);
}

function safeError(error) {
  return String(error?.message || 'Notification dispatch failed')
    .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 500);
}

function heartbeatTableMissing(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  return code === '42P01'
    || code === 'PGRST205'
    || /order_notification_worker_heartbeats.*(does not exist|schema cache)/i.test(message);
}

export async function writeWorkerHeartbeat(supabase, {
  workerId,
  status,
  startedAt,
  finishedAt = null,
  summary = null,
  error = null,
}) {
  try {
    const row = {
      worker_id: workerId,
      status,
      started_at: new Date(startedAt).toISOString(),
      finished_at: finishedAt == null ? null : new Date(finishedAt).toISOString(),
      summary,
      last_error: error ? safeError(error) : null,
      updated_at: new Date(finishedAt ?? startedAt).toISOString(),
    };
    const { error: dbError } = await supabase
      .from('order_notification_worker_heartbeats')
      .upsert(row, { onConflict: 'worker_id' });
    if (dbError && !heartbeatTableMissing(dbError)) {
      console.warn('order-notification-worker: heartbeat update failed:', safeError(dbError));
    }
    return !dbError || heartbeatTableMissing(dbError);
  } catch (dbError) {
    if (!heartbeatTableMissing(dbError)) {
      console.warn('order-notification-worker: heartbeat update failed:', safeError(dbError));
    }
    return heartbeatTableMissing(dbError);
  }
}

export async function runNotificationWorker({
  supabase = getQueueClient(),
  dispatch = dispatchJob,
  now = Date.now,
  workerId = `vercel-${randomUUID()}`,
  budgetMs = WORKER_BUDGET_MS,
  claimLimit = CLAIM_LIMIT,
} = {}) {
  const startedAt = now();
  const deadline = startedAt + Math.min(WORKER_BUDGET_MS, Math.max(1000, budgetMs));
  const summary = {
    workerId,
    staleRequeued: 0,
    claimed: 0,
    accepted: 0,
    retried: 0,
    deadLettered: 0,
    budgetDeferred: 0,
    results: [],
  };

  await writeWorkerHeartbeat(supabase, {
    workerId,
    status: 'running',
    startedAt,
    summary,
  });

  let runError = null;
  try {
    const queue = createNotificationQueue(supabase);
    summary.staleRequeued = await queue.requeueStaleNotificationJobs();
    const jobs = await queue.claimNotificationJobs({
      workerId,
      limit: Math.max(1, Math.min(CLAIM_LIMIT, Number(claimLimit) || CLAIM_LIMIT)),
      leaseSeconds: LEASE_SECONDS,
    });
    summary.claimed = jobs.length;

    for (const job of jobs) {
      const remainingMs = deadline - now();
      if (remainingMs < MIN_DISPATCH_BUDGET_MS) {
        await queue.releaseNotificationJob(job.id, {
          leaseToken: job.lease_token,
          reason: 'Worker budget ended before this job was dispatched',
          errorCode: 'worker_budget_exhausted',
        });
        summary.retried += 1;
        summary.budgetDeferred += 1;
        summary.results.push({ id: job.id, channel: job.channel, state: 'retry_wait' });
        continue;
      }

      try {
        const result = await dispatch(job, {
          timeoutMs: Math.min(12_000, Math.max(1000, remainingMs - 500)),
        });
        await queue.completeNotificationJob(job.id, {
          leaseToken: job.lease_token,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          providerStatus: result.httpStatus,
        });
        summary.accepted += 1;
        // "accepted" means the email provider or PDF storage accepted the work.
        summary.results.push({
          id: job.id,
          channel: job.channel,
          state: 'accepted',
          providerMessageId: result.providerMessageId || null,
        });
      } catch (rawError) {
        const error = rawError instanceof NotificationProviderError
          ? rawError
          : new NotificationProviderError(safeError(rawError), {
            code: 'worker_dispatch_error',
            retryable: true,
          });
        const retryable = shouldRetryJob(job, error);
        const retryAfterMs = retryable
          ? retryDelayMs(job.attempt_count, error.retryAfterMs)
          : null;
        const finish = retryable
          ? queue.retryNotificationJob
          : queue.failNotificationJob;
        await finish(job.id, {
          leaseToken: job.lease_token,
          retryAfterMs,
          provider: job.channel.includes('email') ? 'brevo' : null,
          providerStatus: error.httpStatus,
          errorCode: error.code,
          errorSummary: safeError(error),
        });
        if (retryable) summary.retried += 1;
        else summary.deadLettered += 1;
        summary.results.push({
          id: job.id,
          channel: job.channel,
          state: retryable ? 'retry_wait' : 'dead_letter',
          errorCode: error.code,
        });
      }
    }
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    const finishedAt = now();
    await writeWorkerHeartbeat(supabase, {
      workerId,
      status: runError ? 'failed' : 'completed',
      startedAt,
      finishedAt,
      summary: { ...summary, durationMs: Math.max(0, finishedAt - startedAt) },
      error: runError,
    });
  }

  return {
    ...summary,
    durationMs: Math.max(0, now() - startedAt),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isNotificationWorkerAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runNotificationWorker();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('order-notification-worker:', safeError(error));
    return res.status(500).json({ error: 'Notification worker failed' });
  }
}
