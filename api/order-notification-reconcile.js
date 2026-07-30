import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { enqueueOrderNotificationJobs } from './_order-notification-enqueue.js';

const RECONCILE_BUDGET_MS = 45_000;
const RECENT_ORDER_DAYS = 14;
const PAGE_SIZE = 25;
const MAX_SCANNED = 200;
const MAX_RECOVERED = 10;
const MIN_ENQUEUE_BUDGET_MS = 3_000;

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function isNotificationReconcileAuthorized(req) {
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

export async function listRecentOrders(supabase, {
  since,
  cursor = null,
  limit = PAGE_SIZE,
}) {
  let query = supabase
    .from('orders')
    .select('id, order_number, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(Math.max(1, Math.min(PAGE_SIZE, Number(limit) || PAGE_SIZE)));

  if (cursor?.createdAt && cursor?.id) {
    // Stable keyset pagination prevents the oldest page of healthy orders from
    // starving a later order whose enqueue step was interrupted.
    query = query.or(
      `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw new Error(`Could not scan recent orders: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

export async function listQueuedOrderIds(supabase, orderIds) {
  const ids = [...new Set((orderIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Set();
  const { data, error } = await supabase
    .from('order_notification_jobs')
    .select('order_id')
    .in('order_id', ids);
  if (error) throw new Error(`Could not inspect notification jobs: ${error.message}`);
  return new Set((data || []).map((row) => String(row.order_id)));
}

function cursorFor(order) {
  return order ? { createdAt: order.created_at, id: String(order.id) } : null;
}

/**
 * Safety-net reconciliation only. It creates missing durable queue jobs and
 * never contacts Brevo or WATI; the separately authenticated worker dispatches.
 */
export async function runNotificationReconcile({
  supabase = null,
  enqueue = enqueueOrderNotificationJobs,
  listOrders = null,
  listQueued = null,
  now = Date.now,
  budgetMs = RECONCILE_BUDGET_MS,
  recentOrderDays = RECENT_ORDER_DAYS,
  maxScanned = MAX_SCANNED,
  maxRecovered = MAX_RECOVERED,
} = {}) {
  const client = supabase || ((!listOrders || !listQueued) ? getQueueClient() : null);
  const orderLister = listOrders || ((input) => listRecentOrders(client, input));
  const queuedLister = listQueued || ((ids) => listQueuedOrderIds(client, ids));
  const startedAt = now();
  const deadline = startedAt + Math.min(RECONCILE_BUDGET_MS, Math.max(1000, budgetMs));
  const since = new Date(startedAt - recentOrderDays * 24 * 60 * 60_000).toISOString();
  const summary = {
    scanned: 0,
    skippedWithJobs: 0,
    recovered: 0,
    failed: 0,
    budgetStopped: false,
    cursor: null,
    results: [],
  };

  let cursor = null;
  while (summary.scanned < maxScanned && summary.recovered < maxRecovered) {
    if (deadline - now() < MIN_ENQUEUE_BUDGET_MS) {
      summary.budgetStopped = true;
      break;
    }
    const page = await orderLister({
      since,
      cursor,
      limit: Math.min(PAGE_SIZE, maxScanned - summary.scanned),
    });
    if (!page.length) break;

    const queuedIds = await queuedLister(page.map((order) => order.id));
    for (const order of page) {
      summary.scanned += 1;
      cursor = cursorFor(order);
      summary.cursor = cursor;
      if (queuedIds.has(String(order.id))) {
        summary.skippedWithJobs += 1;
        continue;
      }
      if (summary.recovered >= maxRecovered || deadline - now() < MIN_ENQUEUE_BUDGET_MS) {
        summary.budgetStopped = true;
        break;
      }
      try {
        const jobs = await enqueue(String(order.id));
        summary.recovered += 1;
        summary.results.push({
          orderId: String(order.id),
          orderNumber: order.order_number || null,
          queued: Array.isArray(jobs) ? jobs.length : null,
        });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({
          orderId: String(order.id),
          orderNumber: order.order_number || null,
          error: String(error?.message || 'enqueue_failed').slice(0, 300),
        });
      }
    }
    if (page.length < PAGE_SIZE || summary.budgetStopped) break;
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
  if (!isNotificationReconcileAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const result = await runNotificationReconcile();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('order-notification-reconcile:', error?.message || error);
    return res.status(500).json({ error: 'Notification reconciliation failed' });
  }
}
