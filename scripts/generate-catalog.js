/**
 * Generates public/products.json at build time from Supabase.
 * Run: node scripts/generate-catalog.js
 * Vercel runs this via the prebuild script before vite build.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import SKU_SUBS from '../api/sku-subcategories.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load env from .env.local (dev) or process.env (CI/Vercel)
let envVars = {};
try {
  const raw = readFileSync(join(__dir, '../.env.local'), 'utf8');
  envVars = Object.fromEntries(
    raw.split('\n').filter(l => l.includes('=')).map(l => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim()];
    })
  );
} catch { /* use process.env only */ }

const SUPABASE_URL = process.env.VITE_STOCK_SUPABASE_URL || envVars.VITE_STOCK_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_STOCK_SUPABASE_KEY || envVars.VITE_STOCK_SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_STOCK_SUPABASE_URL or VITE_STOCK_SUPABASE_KEY — skipping catalog generation');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PAGE_SIZE = 1000;

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

async function fetchAllRows(table, selectCols = '*', filter = null) {
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
    image: (wpRow.image_url || '').split(',')[0].trim(),
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
    sortOrder: wpRow.sort_order || 0,
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

async function main() {
  const t0 = Date.now();
  process.stdout.write('Generating public/products.json...');

  const [wpRows, stockRows] = await Promise.all([
    fetchAllRows('website_products', '*', (q) => q.eq('active', true)),
    fetchAllRows('products', 'sku,sell_price,stock_qty,yearly_sales,supplier'),
  ]);

  const stockMap = {};
  for (const s of stockRows) stockMap[s.sku] = s;

  const products = wpRows
    .map((wp) => adapt(wp, stockMap[wp.barcode]))
    .filter((p) => p.stockQty > 0 && p.category && p.image);

  const outPath = join(__dir, '../public/products.json');
  writeFileSync(outPath, JSON.stringify(products));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(` ${products.length} products, ${(JSON.stringify(products).length / 1024).toFixed(0)}KB (${elapsed}s)`);
}

main().catch(err => {
  console.error('\nCatalog generation failed:', err.message);
  // Don't block the build if generation fails — the edge API is the fallback
  process.exit(0);
});
