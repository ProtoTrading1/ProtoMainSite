import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const ALLOWED = new Set(['product_view', 'category_view']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { eventType, entityId, entityLabel, customerId } = req.body || {};
  if (!ALLOWED.has(eventType)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }

  const supabase = getAdminClient();
  const { error } = await supabase.from('analytics_events').insert([{
    event_type: eventType,
    entity_id: entityId ? String(entityId) : null,
    entity_label: entityLabel ? String(entityLabel).slice(0, 200) : null,
    customer_id: customerId || null,
  }]);

  if (error) {
    // Table may not exist until migration runs — don't break the portal
    if (error.code === '42P01') return res.status(200).json({ ok: true, skipped: true });
    return res.status(400).json({ error: error.message });
  }

  return res.status(200).json({ ok: true });
}
