import { createClient } from '@supabase/supabase-js';
import { requireAuth } from './_auth.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  // Users may only fetch their own profile unless they are admin
  if (user.id !== userId) {
    const supabase = getAdminClient();
    const { data: caller } = await supabase
      .from('customers')
      .select('role')
      .eq('id', user.id)
      .single();
    if (caller?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) return res.status(200).json({ profile: null });
    return res.status(200).json({ profile: data });
  } catch {
    return res.status(200).json({ profile: null });
  }
}
