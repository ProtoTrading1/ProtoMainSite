import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const ALLOWED = new Set(['product_view', 'category_view']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { eventType, entityId, entityLabel, customerId } = req.body || {};
  if (!ALLOWED.has(eventType)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }

  // This is an unauthenticated write — cap every free-text field so a caller
  // can't bloat the table with multi-MB rows, and only accept a well-formed
  // customer id so a garbage value can't trip an FK error we then leak.
  const supabase = getAdminClient();
  const { error } = await supabase.from('analytics_events').insert([{
    event_type: eventType,
    entity_id: entityId ? String(entityId).slice(0, 200) : null,
    entity_label: entityLabel ? String(entityLabel).slice(0, 200) : null,
    customer_id: UUID_RE.test(String(customerId || '')) ? customerId : null,
  }]);

  if (error) {
    // Table may not exist until migration runs — don't break the portal
    if (error.code === '42P01') return res.status(200).json({ ok: true, skipped: true });
    console.error('track-event insert error:', error.message);
    return res.status(400).json({ error: 'Could not record event' });
  }

  return res.status(200).json({ ok: true });
}
