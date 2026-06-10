import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { requireAdmin } from './_auth.js';
import { adaptProduct } from './_adapt-product.js';

const PAGE_SIZE = 1000;

async function fetchAllRows(supabase, table, selectCols = '*', filter = null) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(selectCols).range(from, from + PAGE_SIZE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireAdmin(req, res);
  if (!user) return;

  try {
    const supabase = createClient(
      process.env.VITE_STOCK_SUPABASE_URL,
      process.env.VITE_STOCK_SUPABASE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const [wpRows, stockRows] = await Promise.all([
      fetchAllRows(supabase, 'website_products', '*', (q) => q.eq('active', true).order('sort_order', { ascending: true })),
      fetchAllRows(supabase, 'products', 'sku,sell_price,stock_qty,yearly_sales,supplier'),
    ]);

    const stockMap = {};
    for (const s of stockRows) stockMap[s.sku] = s;

    const products = wpRows
      .map((wp) => adaptProduct(wp, stockMap[wp.barcode]))
      .filter((p) => p.stockQty > 0 && p.category && p.image);

    const outPath = join(process.cwd(), 'public', 'products.json');
    writeFileSync(outPath, JSON.stringify(products));

    return res.status(200).json({ ok: true, count: products.length });
  } catch (err) {
    console.error('regenerate-catalog error:', err);
    return res.status(500).json({ error: err.message || 'Catalog regeneration failed' });
  }
}
