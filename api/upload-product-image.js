import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

const BUCKET = 'product-images';

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

  const { filename, contentType, base64 } = req.body || {};
  if (!filename || !contentType || !base64) {
    return res.status(400).json({ error: 'filename, contentType, and base64 are required' });
  }

  const supabase = getStockAdminClient();

  // Ensure bucket exists (public so URLs work without auth)
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  const buffer = Buffer.from(base64, 'base64');
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(safeName, buffer, { contentType, upsert: false });

  if (error) return res.status(400).json({ error: error.message });

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(safeName);

  return res.status(200).json({ url: publicUrl });
}
