import { createClient } from '@supabase/supabase-js';
import SKU_SUBS from './sku-subcategories.js';

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

const DEPT_SLUG_MAP = {
  'Arts, Crafts & Stationery': 'arts-crafts-stationery',
  'Beads, Jewellery & Accessories': 'beads-jewellery',
  'Beauty & Personal Care': 'beauty-personal-care',
  'Events & Parties': 'events-parties',
  'Fashion & Accessories': 'fashion-accessories',
  'Food & Drinks': 'food-drinks',
  'Hardware': 'hardware',
  'Homeware & Kitchen': 'homeware-kitchen',
  'Packaging': 'packaging',
  'Textiles': 'textiles',
  'Toys, Games & Kids': 'toys-games-kids',
};

function labelToSlug(label) {
  if (!label) return '';
  return label.toLowerCase().replace(/[,&]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function adapt(wpRow, stockRow) {
  const stockQty = stockRow?.stock_qty ?? 0;
  const rawDept = (wpRow.category || '').trim();
  const deptSlug = DEPT_SLUG_MAP[rawDept] || labelToSlug(rawDept);
  const subs = SKU_SUBS[wpRow.website_sku] || [];
  const sub1Slug = subs[0] ? labelToSlug(subs[0]) : '';
  const sub2Slug = subs[1] ? labelToSlug(subs[1]) : '';
  const categoryPath = deptSlug
    ? sub1Slug
      ? sub2Slug ? [deptSlug, sub1Slug, sub2Slug] : [deptSlug, sub1Slug]
      : [deptSlug]
    : [];
  return {
    id: wpRow.website_sku,
    code: wpRow.barcode,
    barcode: wpRow.barcode,
    websiteSku: wpRow.website_sku,
    parentSku: wpRow.parent_sku,
    name: wpRow.title,
    price: Number(stockRow?.sell_price ?? 0),
    image: wpRow.image_url || '',
    stockQty,
    stockOnHand: stockQty,
    colour: wpRow.colour || '',
    category: deptSlug,
    categoryPath,
    tags: [],
    badges: [],
    isNew: false,
    isSpecial: false,
    isArchived: !wpRow.active,
    sortOrder: 0,
    minQty: 1,
    casePack: '',
    marginCue: '',
    leadTime: '',
    tradeNote: '',
    inStock: stockQty > 0,
    createdAt: wpRow.created_at,
    yearlySales: stockRow?.yearly_sales ?? 0,
    supplier: stockRow?.supplier || '',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.VITE_STOCK_SUPABASE_URL,
      process.env.VITE_STOCK_SUPABASE_KEY,
    );

    const [wpRows, stockRows] = await Promise.all([
      fetchAllRows(supabase, 'website_products', '*', (q) => q.eq('active', true).order('sort_order', { ascending: true })),
      fetchAllRows(supabase, 'products', 'sku,sell_price,stock_qty,yearly_sales,supplier'),
    ]);

    const stockMap = {};
    for (const s of stockRows) stockMap[s.sku] = s;

    const products = wpRows
      .map((wp) => adapt(wp, stockMap[wp.barcode]))
      .filter((p) => p.stockQty > 0 && p.category);

    // Vercel edge cache: serve instantly for 60s, then revalidate in background for up to 1hr
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=3600');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(products);
  } catch (err) {
    console.error('products api error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch products' });
  }
}
