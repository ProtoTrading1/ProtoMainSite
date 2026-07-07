import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readSiteConfigJson } from './_site-config.js';
import { injectMotarroIntoTree, enrichMotarroCategoryFields } from './_mottaro-category.js';

const PAGE_SIZE = 1000;
const TAXONOMY_FILE = 'taxonomy/categories.json';
const BUNDLED_PATH = join(process.cwd(), 'src/data/categories.json');
const STOCK_SELECT = [
  'sku', 'barcode', 'title', 'original_description', 'price',
  'image_url_one', 'image_url_two', 'image_url_three', 'image_url_four',
  'stock_qty', 'available_stock', 'keep_live_when_oos', 'created_at',
  'category', 'subcategory_one', 'subcategory_two', 'subcategory_three', 'subcategory_four',
  'mottaro_path',
].join(', ');

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

async function loadSalesByBarcode(supabase, skuFilter = null) {
  try {
    const rows = await fetchAllRows(
      supabase,
      'products',
      'sku, yearly_sales',
      skuFilter?.length ? (q) => q.in('sku', skuFilter) : null,
    );
    const map = new Map();
    for (const row of rows) {
      const key = String(row.sku || '').trim().toUpperCase();
      if (!key) continue;
      const sales = Number(row.yearly_sales) || 0;
      map.set(key, Math.max(map.get(key) || 0, sales));
    }
    return map;
  } catch (err) {
    console.warn('products api: yearly_sales unavailable:', err.message);
    return new Map();
  }
}

function parseSkuQuery(raw) {
  const value = Array.isArray(raw) ? raw.join(',') : String(raw || '');
  const list = value
    .split(',')
    .map((sku) => sku.trim())
    .filter(Boolean);
  if (!list.length) return null;
  return [...new Set(list)];
}

function adapt(row, tree, salesByBarcode = new Map()) {
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
    keepLiveWhenOos: !!row.keep_live_when_oos,
    orderableWhenOutOfStock: !!row.keep_live_when_oos,
    yearlySales: salesByBarcode.get(String(row.barcode || '').trim().toUpperCase()) || 0,
    createdAt: row.created_at,
    supplier: '',
  };
  return enrichMotarroCategoryFields(base, row, tree, categoryPath);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const requestedSkus = parseSkuQuery(req.query?.skus);
    const supabase = createClient(
      process.env.VITE_STOCK_SUPABASE_URL,
      process.env.VITE_STOCK_SUPABASE_KEY,
    );

    const [rows, tree, salesByBarcode] = await Promise.all([
      fetchAllRows(
        supabase,
        'website_stock',
        STOCK_SELECT,
        requestedSkus?.length ? (q) => q.in('sku', requestedSkus) : null,
      ),
      loadTaxonomyTree(),
      loadSalesByBarcode(supabase, requestedSkus),
    ]);
    const products = rows
      .map((row) => adapt(row, tree, salesByBarcode))
      .filter((p) => p.category || (p.isMultiCategory && p.alternateCategoryPath?.length));

    // Short edge cache so product membership / new products reflect quickly.
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(products);
  } catch (err) {
    console.error('products api error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch products' });
  }
}
