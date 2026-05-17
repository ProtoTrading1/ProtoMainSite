import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Check env vars are loaded
  if (!supabaseUrl || !serviceKey) {
    return res.status(200).json({
      step: 'env',
      ok: false,
      supabaseUrl: !!supabaseUrl,
      serviceKey: !!serviceKey,
    });
  }

  // Try generateLink
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'recovery',
    email: req.query.email || 'test@example.com',
  });

  return res.status(200).json({
    step: 'generateLink',
    ok: !error,
    error: error?.message,
    errorCode: error?.code,
    hasLink: !!data?.properties?.action_link,
  });
}
