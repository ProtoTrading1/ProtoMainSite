import { createClient } from '@supabase/supabase-js';

function getServiceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function requireAuth(req, res) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const { data: { user }, error } = await getServiceClient().auth.getUser(header.slice(7));
  if (error || !user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return user;
}

export async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  const { data: customer } = await getServiceClient()
    .from('customers')
    .select('role')
    .eq('id', user.id)
    .single();

  if (customer?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}
