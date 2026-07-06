import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';
import {
  getPasswordResetBaseUrl,
  notifyCustomerPasswordResetEmail,
} from './_trade-application-notify.js';

function makeToken(email, secret) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 3600000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function getServiceClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function lookupCustomerName(supabase, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { exists: false, name: '' };

  const { data: { users }, error } = await supabase.auth.admin.listUsers({ filter: `email.eq.${normalized}` });
  if (error) {
    console.error('send-reset-email listUsers error:', error.message);
    return { exists: false, name: '' };
  }

  const user = users?.find((u) => u.email?.toLowerCase() === normalized);
  if (!user) return { exists: false, name: '' };

  const { data: customer } = await supabase
    .from('customers')
    .select('name, contact_name')
    .eq('id', user.id)
    .maybeSingle();

  const name = customer?.contact_name || customer?.name || user.user_metadata?.name || '';
  return { exists: true, name: String(name || '').trim() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return res.status(400).json({ error: 'Email required' });

  const secret = process.env.RESET_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    console.error('send-reset-email: RESET_TOKEN_SECRET / SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(200).json({ ok: true });
  }

  const supabase = getServiceClient();
  const { exists, name } = await lookupCustomerName(supabase, normalizedEmail);

  if (exists) {
    const token = makeToken(normalizedEmail, secret);
    const baseUrl = getPasswordResetBaseUrl(req);
    const resetLink = `${baseUrl}/#/reset-password?token=${encodeURIComponent(token)}`;

    const result = await notifyCustomerPasswordResetEmail({
      email: normalizedEmail,
      resetLink,
      name,
    });

    if (!result?.ok && !result?.skipped) {
      console.error('send-reset-email: admin password reset email failed', JSON.stringify(result));
    }
  }

  // Generic response — do not reveal whether the account exists.
  return res.status(200).json({ ok: true });
}
