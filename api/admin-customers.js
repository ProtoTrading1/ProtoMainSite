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

  // GET — list customers by tab
  if (req.method === 'GET') {
    const { tab = 'requests', page = '1', pageSize = '50', search = '' } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const size = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const from = (pageNum - 1) * size;
    const to = from + size - 1;

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (tab === 'premium') {
      query = query.eq('tier', 'premium').eq('is_approved', true);
    } else if (tab === 'requests') {
      query = query.eq('is_approved', false);
    } else {
      query = query.neq('tier', 'premium').eq('is_approved', true);
    }

    const q = (search || '').trim();
    if (q) {
      const safe = q.replace(/[%',()]/g, ' ').trim();
      if (safe) query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }

    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    const rows = data || [];

    // Count orders per customer server-side — avoids a slow round-trip from the browser
    let orderCounts = {};
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id).filter(Boolean);
      const { data: orderRows } = await supabase
        .from('orders')
        .select('customer_id')
        .in('customer_id', ids);
      (orderRows || []).forEach((r) => {
        if (!r.customer_id) return;
        orderCounts[r.customer_id] = (orderCounts[r.customer_id] || 0) + 1;
      });
    }

    return res.status(200).json({
      rows: rows.map((r) => ({ ...r, orderCount: orderCounts[r.id] || 0 })),
      total: count || 0,
      page: pageNum,
      pageSize: size,
    });
  }

  // DELETE — remove customer
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    // Delete from customers table first
    const { error: custError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);
    if (custError) return res.status(400).json({ error: custError.message });

    // Also delete the auth user
    const { error: authError } = await supabase.auth.admin.deleteUser(id);
    if (authError) console.error('auth.admin.deleteUser error:', authError.message);

    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}
