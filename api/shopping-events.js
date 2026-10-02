import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';
import { normalizeShoppingEvent, shoppingEnvironment, internalShoppingUser } from './_shopping-event.js';
export function createShoppingEventsHandler({ authorize = requireApprovedCustomer, rateLimit = checkRateLimit, client = () => createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const access = await authorize(req, res); if (!access) return;
    let event; try { event = normalizeShoppingEvent(req.body || {}); } catch (error) { return res.status(400).json({ error: error.message }); }
    try {
      const supabase = client();
      const limit = await rateLimit({ bucket: `shopping:${access.user.id}:${clientIp(req)}`, max: 180, windowSeconds: 60, supabase });
      if (!limit.allowed) return res.status(200).json({ ok: true, skipped: true, reason: 'rate_limit' });
      // Client order totals are never accepted. Only a saved order owned by this customer may be linked.
      if (event.order_id) {
        const owned = await supabase.from('orders').select('id').eq('id', event.order_id).eq('customer_id', access.user.id).maybeSingle();
        if (owned.error || !owned.data) return res.status(400).json({ error: 'Invalid order attribution' });
      }
      const { error } = await supabase.from('shopping_events').insert({ ...event, customer_id: access.user.id, environment: shoppingEnvironment(req), is_internal: internalShoppingUser(access) });
      if (error?.code === '23505') return res.status(200).json({ ok: true, duplicate: true });
      if (['42P01', 'PGRST205'].includes(error?.code)) return res.status(200).json({ ok: true, skipped: true, reason: 'schema_unavailable' });
      if (error) { console.error('shopping analytics insert failed:', error.code); return res.status(503).json({ error: 'Analytics unavailable' }); }
      return res.status(200).json({ ok: true });
    } catch { return res.status(503).json({ error: 'Analytics unavailable' }); }
  };
}
export default createShoppingEventsHandler();
