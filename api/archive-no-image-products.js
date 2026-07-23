import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './_auth.js';

const PAGE_SIZE = 1000;
const ARCHIVED_BY = 'admin-bulk';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function rowHasImage(row) {
  return [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four]
    .some((url) => String(url || '').trim());
}

async function fetchNoImageSkus() {
  const supabase = getStockClient();
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('website_stock')
      .select('sku, barcode, title, category, image_url_one, image_url_two, image_url_three, image_url_four')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows.filter((row) => !rowHasImage(row));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminUser = await requireAdmin(req, res);
  if (!adminUser) return;

  try {
    const targets = await fetchNoImageSkus();

    if (req.method === 'GET') {
      return res.status(200).json({
        count: targets.length,
        skus: targets.map((row) => ({
          sku: row.sku,
          barcode: row.barcode,
          title: row.title,
          category: row.category,
        })),
      });
    }

    const supabase = getStockClient();
    const archived = [];
    const failures = [];

    for (const row of targets) {
      const { error } = await supabase.rpc('archive_product', {
        p_sku: row.sku,
        p_by: ARCHIVED_BY,
      });
      if (error) failures.push({ sku: row.sku, error: error.message });
      else archived.push(row.sku);
    }

    return res.status(200).json({
      ok: failures.length === 0,
      archivedCount: archived.length,
      archived,
      failures,
    });
  } catch (err) {
    console.error('archive-no-image-products error:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Archive failed' });
  }
}
