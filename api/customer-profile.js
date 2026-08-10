import { createClient } from '@supabase/supabase-js';
import { requireAuth } from './_auth.js';

function getAuthenticatedClient(req) {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: req.headers.authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).end();

  const user = await requireAuth(req, res);
  if (!user) return;

  // PATCH: user updates their own WhatsApp opt-in preference
  if (req.method === 'PATCH') {
    const { markPortalWelcomeSeen, acceptWhatsapp, whatsappPhone } = req.body || {};
    if (markPortalWelcomeSeen === true) {
      const supabase = getAuthenticatedClient(req);
      const markedAt = new Date().toISOString();
      const markResult = await supabase
        .from('customers')
        .update({ portal_welcome_seen_at: markedAt })
        .eq('id', user.id)
        .is('portal_welcome_seen_at', null)
        .select('id, portal_welcome_seen_at')
        .maybeSingle();

      if (markResult.error) {
        console.error('portal welcome update error:', markResult.error.message, '| userId:', user.id);
        return res.status(500).json({
          error: 'Failed to record the portal welcome.',
          code: 'PORTAL_WELCOME_MARK_FAILED',
        });
      }

      let profile = markResult.data;
      if (!profile) {
        const currentResult = await supabase
          .from('customers')
          .select('id, portal_welcome_seen_at')
          .eq('id', user.id)
          .maybeSingle();

        if (currentResult.error) {
          console.error('portal welcome read error:', currentResult.error.message, '| userId:', user.id);
          return res.status(500).json({
            error: 'Failed to read the portal welcome status.',
            code: 'PORTAL_WELCOME_READ_FAILED',
          });
        }
        profile = currentResult.data;
      }

      if (!profile?.portal_welcome_seen_at) {
        return res.status(404).json({
          error: 'Customer profile not found.',
          code: 'CUSTOMER_PROFILE_NOT_FOUND',
        });
      }

      return res.status(200).json({
        ok: true,
        portalWelcomeSeenAt: profile.portal_welcome_seen_at,
      });
    }

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
    const supabase = getAuthenticatedClient(req);
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
  const supabase = getAuthenticatedClient(req);
  if (user.id !== userId) {
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
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('customer profile lookup error:', error.code || 'unknown');
      return res.status(503).json({
        error: 'Your trade account could not be loaded. Please try again.',
        code: 'CUSTOMER_PROFILE_LOOKUP_FAILED',
      });
    }
    if (!data) {
      return res.status(404).json({
        error: 'No trade profile is linked to this account.',
        code: 'CUSTOMER_PROFILE_NOT_FOUND',
      });
    }
    return res.status(200).json({ profile: data });
  } catch (error) {
    console.error('customer profile lookup exception:', error?.name || 'unknown');
    return res.status(503).json({
      error: 'Your trade account could not be loaded. Please try again.',
      code: 'CUSTOMER_PROFILE_LOOKUP_FAILED',
    });
  }
}
