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

  if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  // PATCH: user updates their own WhatsApp opt-in preference
  if (req.method === 'PATCH') {
    const { acceptWhatsapp, whatsappPhone } = req.body || {};
    if (typeof acceptWhatsapp !== 'boolean') {
      return res.status(400).json({ error: 'acceptWhatsapp must be true or false' });
    }
    const patch = {
      accept_whatsapp: acceptWhatsapp,
      whatsapp_opt_in_at: acceptWhatsapp ? new Date().toISOString() : null,
    };
    if (typeof whatsappPhone === 'string' && whatsappPhone.trim()) {
      patch.phone = whatsappPhone.trim();
    }
    const supabase = getAdminClient();
    let { data, error } = await supabase
      .from('customers')
      .update(patch)
      .eq('id', user.id)
      .select('id, accept_whatsapp')
      .single();
    if (error) {
      // whatsapp_opt_in_at column may not exist yet (migration 007) — retry without it
      const patchWithoutTs = {
        accept_whatsapp: patch.accept_whatsapp,
        ...(patch.phone ? { phone: patch.phone } : {}),
      };
      const retry = await supabase
        .from('customers')
        .update(patchWithoutTs)
        .eq('id', user.id)
        .select('id, accept_whatsapp')
        .single();
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      console.error('whatsapp opt-in update error:', error.message, '| userId:', user.id);
      return res.status(500).json({ error: 'Failed to update WhatsApp preference.' });
    }
    return res.status(200).json({ ok: true, profile: data });
  }

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
