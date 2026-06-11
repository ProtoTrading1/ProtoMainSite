/**
 * Generates public/products.json at build time from website_stock (stock project).
 * Run: node scripts/generate-catalog.js
 * Vercel runs this via the build script before vite build.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load env from .env.local (dev) or process.env (CI/Vercel)
let envVars = {};
try {
  const raw = readFileSync(join(__dir, '../.env.local'), 'utf8');
  envVars = Object.fromEntries(
    raw.split('\n').filter((l) => l.includes('=')).map((l) => {
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

// Must match labelToSlug in src/lib/taxonomy.js and api/products.js.
function labelToSlug(label) {
  if (label === null || label === undefined) return '';
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function fetchAllRows(table, selectCols = '*') {
  const rows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(selectCols).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

function adapt(row) {
  const images = [row.image_url_one, row.image_url_two].filter(Boolean);
  const subLabels = [row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four].filter(Boolean);
  const deptSlug = labelToSlug(row.category);
  const categoryPath = deptSlug ? [deptSlug, ...subLabels.map(labelToSlug)] : [];
  return {
    id: row.sku,
    code: row.barcode,
    barcode: row.barcode,
    websiteSku: row.sku,
    sku: row.sku,
    parentSku: null,
    name: row.title,
    title: row.title,
    description: row.original_description || '',
    originalDescription: row.original_description || '',
    price: Number(row.price) || 0,
    images,
    image: images[0] || '',
    secondaryImage: images[1] || '',
    stockQty: 0,
    stockOnHand: 0,
    colour: '',
    category: deptSlug,
    categoryLabel: row.category,
    categoryPath,
    subcategoryLabels: subLabels,
    tags: [],
    badges: [],
    isNew: false,
    isSpecial: false,
    isArchived: false,
    sortOrder: 0,
    minQty: 1,
    casePack: '',
    marginCue: '',
    leadTime: '',
    tradeNote: '',
    inStock: true,
    createdAt: row.created_at,
    yearlySales: 0,
    supplier: '',
  };
}

async function main() {
  const t0 = Date.now();
  process.stdout.write('Generating public/products.json...');

  const rows = await fetchAllRows('website_stock', '*');
  const products = rows.map(adapt).filter((p) => p.category);

  const outPath = join(__dir, '../public/products.json');
  writeFileSync(outPath, JSON.stringify(products));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(` ${products.length} products, ${(JSON.stringify(products).length / 1024).toFixed(0)}KB (${elapsed}s)`);
}

main().catch((err) => {
  console.error('\nCatalog generation failed:', err.message);
  process.exit(0);
});
