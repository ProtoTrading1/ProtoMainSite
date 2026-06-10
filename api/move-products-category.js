import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_auth.js';
import { categoryPathToDbPatch } from '../src/lib/categoryPath.js';

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireAdmin(req, res);
  if (!user) return;

  const { moves } = req.body || {};
  if (!Array.isArray(moves) || !moves.length) {
    return res.status(400).json({ error: 'moves array is required' });
  }

  const supabase = getStockAdminClient();
  const errors = [];

  for (const { websiteSku, categoryPath } of moves) {
    if (!websiteSku || !Array.isArray(categoryPath) || !categoryPath.length) continue;
    const patch = categoryPathToDbPatch(categoryPath);
    const { error } = await supabase
      .from('website_products')
      .update(patch)
      .eq('website_sku', websiteSku);
    if (error) errors.push({ websiteSku, error: error.message });
  }

  if (errors.length) return res.status(207).json({ ok: false, errors });
  return res.status(200).json({ ok: true });
}
