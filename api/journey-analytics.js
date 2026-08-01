import { createClient } from '@supabase/supabase-js';
import { clientIp, checkRateLimit } from './_rate-limit.js';
import { normalizeJourneyEvent } from './_journey-event.js';

function getServiceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
async function optionalCustomerId(req, supabase) {
  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  const { data, error } = await supabase.auth.getUser(header.slice(7));
  return error ? null : data.user?.id || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const ip = clientIp(req);
  const limit = await checkRateLimit({
    bucket: `journey-analytics:${ip}`,
    max: 180,
    windowSeconds: 60,
  });
  if (!limit.allowed) return res.status(200).json({ ok: true, skipped: true });

  let event;
  try {
    event = normalizeJourneyEvent(req.body || {});
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const supabase = getServiceClient();
  const customerId = await optionalCustomerId(req, supabase);
  const { error } = await supabase.from('customer_journey_events').insert([{
    ...event,
    customer_id: customerId,
  }]);

  if (error) {
    // The code can safely preview before migration 059 is applied.
    if (error.code === '42P01') return res.status(200).json({ ok: true, skipped: true });
    console.error('journey analytics insert failed:', error.message);
    return res.status(200).json({ ok: true, skipped: true });
  }

  return res.status(200).json({ ok: true });
}
