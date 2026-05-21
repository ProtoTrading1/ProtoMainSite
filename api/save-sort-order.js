import { createClient } from '@supabase/supabase-js';

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

  const { updates } = req.body || {};
  if (!Array.isArray(updates) || !updates.length) {
    return res.status(400).json({ error: 'updates array is required' });
  }

  const supabase = getStockAdminClient();
  const errors = [];

  for (const { websiteSku, sortOrder } of updates) {
    if (!websiteSku || typeof sortOrder !== 'number') continue;
    const { error } = await supabase
      .from('website_products')
      .update({ sort_order: sortOrder })
      .eq('website_sku', websiteSku);
    if (error) errors.push({ websiteSku, error: error.message });
  }

  if (errors.length) return res.status(207).json({ ok: false, errors });
  return res.status(200).json({ ok: true });
}
