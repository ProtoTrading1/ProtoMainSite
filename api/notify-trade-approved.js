import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_auth.js';
import { sendTradeApprovedEmail } from './_trade-emails.js';

function getAdminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function isServiceAuthorized(req) {
  const secret = process.env.TRADE_NOTIFY_SECRET || process.env.ADMIN_NOTIFY_SECRET;
  if (!secret) return false;
  const header = req.headers['x-trade-notify-secret'] || req.headers['x-admin-secret'];
  return header === secret;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const serviceCall = isServiceAuthorized(req);
  if (!serviceCall) {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
  }

  const { customerId, email } = req.body || {};
  if (!customerId && !email) {
    return res.status(400).json({ error: 'customerId or email required' });
  }

  const supabase = getAdminClient();
  let query = supabase
    .from('customers')
    .select('id, email, name, contact_name, business_name, is_approved')
    .limit(1);

  if (customerId) query = query.eq('id', customerId);
  else query = query.eq('email', String(email).trim().toLowerCase());

  const { data: customer, error } = await query.single();
  if (error || !customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  if (!customer.is_approved) {
    return res.status(400).json({ error: 'Customer is not approved yet' });
  }

  const displayName = customer.contact_name || customer.name || customer.business_name || '';
  const result = await sendTradeApprovedEmail(customer.email, displayName);

  return res.status(200).json({
    ok: true,
    emailSent: result.ok === true,
    skipped: result.skipped === true,
    customerId: customer.id,
  });
}
