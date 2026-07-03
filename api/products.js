import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readSiteConfigJson } from './_site-config.js';
import { injectMotarroIntoTree, enrichMotarroCategoryFields } from './_mottaro-category.js';

const PAGE_SIZE = 1000;
const TAXONOMY_FILE = 'taxonomy/categories.json';
const BUNDLED_PATH = join(process.cwd(), 'src/data/categories.json');

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

function loadBundledTaxonomy() {
  try {
    return JSON.parse(readFileSync(BUNDLED_PATH, 'utf8'));
  } catch {
    return [];
  }
}

async function loadTaxonomyTree() {
  try {
    const stored = await readSiteConfigJson(TAXONOMY_FILE, null);
    let categories = null;
    if (Array.isArray(stored)) categories = stored;
    else if (stored?.categories && Array.isArray(stored.categories)) categories = stored.categories;
    if (categories?.length) return injectMotarroIntoTree(categories);
  } catch {
    // fall through to bundled
  }
  return injectMotarroIntoTree(loadBundledTaxonomy());
}

// Must match labelToSlug in src/lib/taxonomy.js and scripts/lib/master.mjs.
function labelToSlug(label) {
  if (label === null || label === undefined) return '';
  return String(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function adapt(row, tree) {
  const images = [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four].filter(Boolean);
  const subLabels = [row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four].filter(Boolean);
  const deptSlug = labelToSlug(row.category);
  const categoryPath = deptSlug ? [deptSlug, ...subLabels.map(labelToSlug)] : [];
  const base = {
    id: row.sku,
    code: row.barcode,
    barcode: row.barcode,
    websiteSku: row.sku,
    sku: row.sku,
    parentSku: row.barcode || null,
    name: row.title,
    title: row.title,
    description: row.original_description || '',
    originalDescription: row.original_description || '',
    price: Number(row.price) || 0,
    images,
    image: images[0] || '',
    secondaryImage: images[1] || '',
    stockQty: Number(row.stock_qty) || 0,
    stockOnHand: Number(row.available_stock ?? row.stock_qty) || 0,
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
    inStock: (Number(row.available_stock ?? row.stock_qty) || 0) > 0,
    createdAt: row.created_at,
    yearlySales: 0,
    supplier: '',
  };
  return enrichMotarroCategoryFields(base, row, tree, categoryPath);
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

    const [rows, tree] = await Promise.all([
      fetchAllRows(supabase, 'website_stock', '*'),
      loadTaxonomyTree(),
    ]);
    const products = rows.map((row) => adapt(row, tree)).filter((p) => p.category);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(products);
  } catch (err) {
    console.error('products api error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch products' });
  }
}
