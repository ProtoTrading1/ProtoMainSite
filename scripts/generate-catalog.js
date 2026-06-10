/**
 * Generates public/products.json at build time from Supabase.
 * Run: node scripts/generate-catalog.js
 * Vercel runs this via the prebuild script before vite build.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { adaptProduct } from '../api/_adapt-product.js';

const __dir = dirname(fileURLToPath(import.meta.url));

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

async function main() {
  const t0 = Date.now();
  process.stdout.write('Generating public/products.json...');

  const [wpRows, stockRows] = await Promise.all([
    fetchAllRows('website_products', '*', (q) => q.eq('active', true).order('sort_order', { ascending: true })),
    fetchAllRows('products', 'sku,sell_price,stock_qty,yearly_sales,supplier'),
  ]);

  const stockMap = {};
  for (const s of stockRows) stockMap[s.sku] = s;

  const products = wpRows
    .map((wp) => adaptProduct(wp, stockMap[wp.barcode]))
    .filter((p) => p.stockQty > 0 && p.category && p.image);

  const outPath = join(__dir, '../public/products.json');
  writeFileSync(outPath, JSON.stringify(products));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(` ${products.length} products, ${(JSON.stringify(products).length / 1024).toFixed(0)}KB (${elapsed}s)`);
}

main().catch(err => {
  console.error('\nCatalog generation failed:', err.message);
  process.exit(0);
});
