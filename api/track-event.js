import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';

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

  const access = await requireApprovedCustomer(req, res);
  if (!access) return;

  const rl = await checkRateLimit({
    bucket: `track-event:${access.user.id}:${clientIp(req)}`,
    max: 120,
    windowSeconds: 60,
  });
  if (!rl.allowed) return res.status(200).json({ ok: true, skipped: true });

  const { eventType, entityId, entityLabel } = req.body || {};
  if (!ALLOWED.has(eventType)) {
    return res.status(400).json({ error: 'Invalid event type' });
  }

  const supabase = getAdminClient();
  const { error } = await supabase.from('analytics_events').insert([{
    event_type: eventType,
    entity_id: entityId ? String(entityId).slice(0, 200) : null,
    entity_label: entityLabel ? String(entityLabel).slice(0, 200) : null,
    customer_id: UUID_RE.test(access.user.id) ? access.user.id : null,
  }]);

  if (error) {
    // Table may not exist until migration runs — don't break the portal
    if (error.code === '42P01') return res.status(200).json({ ok: true, skipped: true });
    console.error('track-event insert error:', error.message);
    return res.status(400).json({ error: 'Could not record event' });
  }

  return res.status(200).json({ ok: true });
}
