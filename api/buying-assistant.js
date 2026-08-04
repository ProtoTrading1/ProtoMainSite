import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';

const GOALS = new Set(['hot', 'specials', 'start', 'dismissed']);

function adminClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();
  const approved = await requireApprovedCustomer(req, res);
  if (!approved) return;
  const supabase = adminClient();

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('customer_buying_assistant').select('completed_at, goal').eq('customer_id', approved.user.id).maybeSingle();
    if (error) return res.status(200).json({ available: false, completed: false });
    return res.status(200).json({ available: true, completed: Boolean(data?.completed_at), goal: data?.goal || null });
  }

  const goal = String(req.body?.goal || 'dismissed');
  if (!GOALS.has(goal)) return res.status(400).json({ error: 'Invalid buying goal' });
  const { error } = await supabase.from('customer_buying_assistant').upsert({
    customer_id: approved.user.id,
    goal,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'customer_id' });
  if (error) return res.status(503).json({ error: 'Buying assistant persistence is not available yet.' });
  return res.status(200).json({ ok: true });
}
