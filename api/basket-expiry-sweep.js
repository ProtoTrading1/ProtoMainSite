import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SITE_URL } from './_public-site-url.js';
import {
  basketLifecycle,
  buildBasketReminderEmail,
  reminderDue,
} from '../lib/basket-expiry.mjs';

export const config = { maxDuration: 60 };

const BATCH_SIZE = 200;

function authorised(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

function serviceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function sendReminder({ email, name, row, kind }) {
  const lifecycle = basketLifecycle(row);
  const content = buildBasketReminderEmail({
    customerName: name,
    items: row.items,
    kind,
    expiresAt: lifecycle.expiresAt,
    basketUrl: `${PUBLIC_SITE_URL}/?open=basket`,
  });
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: {
        name: process.env.BREVO_SENDER_NAME || 'Proto Trading Online',
        email: process.env.BREVO_SENDER_EMAIL || 'online@proto.co.za',
      },
      to: [{ email, name }],
      subject: content.subject,
      htmlContent: content.html,
      headers: {
        'Idempotency-Key': `proto-basket-${row.customer_id}-${row.started_at}-${kind}`,
      },
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Brevo ${response.status}`);
  }
}

async function archiveExpired(supabase, row, nowIso) {
  const { data, error } = await supabase
    .from('customer_account_carts')
    .update({
      archived_items: row.items,
      archived_at: nowIso,
      items: [],
      activity_at: Date.now(),
      started_at: null,
      expires_at: null,
      extension_used: false,
      reminder_3d_sent_at: null,
      reminder_1d_sent_at: null,
      revision: Number(row.revision || 0) + 1,
      updated_at: nowIso,
    })
    .eq('customer_id', row.customer_id)
    .eq('revision', row.revision)
    .select('customer_id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  // The deployment can safely contain this worker before the migration and
  // launch decision. No database reads, writes or emails occur while disabled.
  if (process.env.BASKET_EXPIRY_ENABLED !== 'true'
      || process.env.BASKET_EXPIRY_EMAILS_ENABLED !== 'true') {
    return res.status(200).json({ enabled: false, sent: 0, archived: 0 });
  }
  if (!process.env.BREVO_API_KEY) {
    return res.status(503).json({ error: 'Email service not configured' });
  }

  const supabase = serviceClient();
  const { data: carts, error: cartError } = await supabase
    .from('customer_account_carts')
    .select('customer_id,items,activity_at,revision,updated_at,started_at,expires_at,extension_used,reminder_3d_sent_at,reminder_1d_sent_at')
    .not('expires_at', 'is', null)
    .order('expires_at', { ascending: true })
    .limit(BATCH_SIZE);
  if (cartError) return res.status(503).json({ error: cartError.message });

  const ids = [...new Set((carts || []).map((row) => row.customer_id).filter(Boolean))];
  const { data: customers, error: customerError } = ids.length
    ? await supabase.from('customers').select('id,name,business_name,email,is_approved').in('id', ids)
    : { data: [], error: null };
  if (customerError) return res.status(503).json({ error: customerError.message });
  const customerById = new Map((customers || []).map((customer) => [customer.id, customer]));

  const result = { enabled: true, scanned: carts?.length || 0, sent: 0, archived: 0, skipped: 0, failed: 0 };
  const nowIso = new Date().toISOString();

  for (const row of carts || []) {
    const due = reminderDue(row);
    if (!due) { result.skipped += 1; continue; }

    try {
      if (due === 'expired') {
        if (await archiveExpired(supabase, row, nowIso)) result.archived += 1;
        else result.skipped += 1;
        continue;
      }

      const customer = customerById.get(row.customer_id);
      if (!customer?.is_approved || !customer?.email) {
        result.skipped += 1;
        continue;
      }

      await sendReminder({
        email: customer.email,
        name: customer.name || customer.business_name || '',
        row,
        kind: due,
      });
      const reminderColumn = due === '1d' ? 'reminder_1d_sent_at' : 'reminder_3d_sent_at';
      const { error } = await supabase
        .from('customer_account_carts')
        .update({ [reminderColumn]: nowIso })
        .eq('customer_id', row.customer_id)
        .eq('revision', row.revision);
      if (error) throw error;
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      console.error('basket-expiry-sweep failed:', {
        customerId: row.customer_id,
        due,
        message: error?.message || 'unknown error',
      });
    }
  }

  return res.status(result.failed ? 207 : 200).json(result);
}
