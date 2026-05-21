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

  const { websiteSku, image, description } = req.body || {};
  if (!websiteSku) return res.status(400).json({ error: 'websiteSku is required' });

  const patch = {};
  if (image !== undefined) patch.image_url = image;
  if (description !== undefined) patch.description = description;

  if (!Object.keys(patch).length) return res.status(200).json({ ok: true });

  const supabase = getStockAdminClient();
  const { error } = await supabase
    .from('website_products')
    .update(patch)
    .eq('website_sku', websiteSku);

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
