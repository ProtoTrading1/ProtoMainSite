import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
import { checkRateLimit, clientIp } from './_rate-limit.js';

function getAdminClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

const ALLOWED_REASONS = new Set(['price', 'information', 'image', 'stock', 'minimum_quantity', 'other']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const access = await requireApprovedCustomer(req, res);
  if (!access) return;
  const rl = await checkRateLimit({ bucket: `product-feedback:${access.user.id}:${clientIp(req)}`, max: 20, windowSeconds: 3600 });
  if (!rl.allowed) return res.status(200).json({ ok: true, skipped: true });

  const body = req.body || {};
  const reason = String(body.reason || '').trim();
  if (!ALLOWED_REASONS.has(reason)) return res.status(400).json({ error: 'Invalid feedback reason' });

  const supabase = getAdminClient();
  const { error } = await supabase.from('customer_feedback').insert([{
    customer_id: access.user.id,
    product_id: body.productId ? String(body.productId).slice(0, 200) : null,
    product_code: body.productCode ? String(body.productCode).slice(0, 120) : null,
    product_label: body.productLabel ? String(body.productLabel).slice(0, 240) : null,
    reason,
    detail: reason === 'other' ? String(body.detail || '').slice(0, 300) : null,
  }]);
  if (error) {
    if (error.code === '42P01') return res.status(200).json({ ok: true, skipped: true });
    console.error('product-feedback insert error:', error.message);
    return res.status(400).json({ error: 'Could not record feedback' });
  }
  return res.status(200).json({ ok: true });
}
