import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  const supabase = getAdminClient();

  // GET — list orders (service role bypasses RLS)
  if (req.method === 'GET') {
    const { limit = '150' } = req.query;
    const lim = Math.min(500, Math.max(1, parseInt(limit, 10) || 150));

    const { data, error } = await supabase
      .from('orders')
      .select('*, customers(name, email, tier)')
      .order('created_at', { ascending: false })
      .limit(lim);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ rows: data || [] });
  }

  // PATCH — update an order
  if (req.method === 'PATCH') {
    const { id, ...patch } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    if (patch.status === 'viewed' && !patch.viewed_at) patch.viewed_at = new Date().toISOString();
    if (patch.status === 'paid' && !patch.paid_at) patch.paid_at = new Date().toISOString();
    if (patch.status === 'delivered' && !patch.delivered_at) patch.delivered_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', id)
      .select('*, customers(name, email, tier)')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ row: data });
  }

  return res.status(405).end();
}
