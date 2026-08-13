/**
 * Presence heartbeat — "this signed-in customer still has the shop open".
 *
 * The admin dashboard counts `customer_presence` rows inside a short freshness
 * window to show a live browsing count. This endpoint is the only writer.
 *
 * It is deliberately the cheapest thing that can work: one authenticated
 * upsert of a single row, no reads, no joins. It is called on a heartbeat by
 * every open storefront tab, so anything more expensive here multiplies across
 * every shopper. There is no rate limit for the same reason — the write is
 * idempotent, touches exactly one row keyed by the caller's own id, and a
 * limiter would add a read to every beat to guard against a caller who can
 * only ever overwrite their own timestamp.
 */
import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';

function serviceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** A session id is for debugging odd readings, so a malformed one is dropped, not fatal. */
export function normalizeSessionId(value) {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
    ? value.trim()
    : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const approved = await requireApprovedCustomer(req, res);
  if (!approved) return;

  const customerId = approved.user.id;
  const supabase = serviceClient();

  // Signing out drops the row immediately, so the count falls straight away
  // instead of waiting for the freshness window to lapse.
  if (req.method === 'DELETE') {
    const { error } = await supabase.from('customer_presence').delete().eq('customer_id', customerId);
    if (error) {
      console.error('presence clear failed:', error.message);
      return res.status(503).json({ error: 'Presence could not be cleared' });
    }
    return res.status(200).json({ ok: true });
  }

  // first_seen_at is deliberately absent: PostgREST builds ON CONFLICT DO
  // UPDATE SET from the payload's keys, so leaving it out means the column
  // takes its default on the first beat and is never overwritten afterwards.
  const { error } = await supabase
    .from('customer_presence')
    .upsert(
      {
        customer_id: customerId,
        last_seen_at: new Date().toISOString(),
        session_id: normalizeSessionId(req.body?.sessionId),
      },
      { onConflict: 'customer_id', ignoreDuplicates: false },
    );

  if (error) {
    console.error('presence heartbeat failed:', error.message);
    return res.status(503).json({ error: 'Presence could not be recorded' });
  }

  return res.status(200).json({ ok: true });
}
