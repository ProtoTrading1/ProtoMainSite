import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readSiteConfigJson } from './_site-config.js';
import { injectMotarroIntoTree, enrichMotarroCategoryFields } from './_mottaro-category.js';
import { loadPlacementMapIfEnabled } from './_placements.js';
import { mergeCategoryPaths } from '../lib/placements.mjs';

const PAGE_SIZE = 1000;
const TAXONOMY_FILE = 'taxonomy/categories.json';
const BUNDLED_PATH = join(process.cwd(), 'src/data/categories.json');
const STOCK_SELECT = [
  'sku', 'barcode', 'title', 'original_description', 'price',
  'image_url_one', 'image_url_two', 'image_url_three', 'image_url_four',
  'stock_qty', 'available_stock', 'keep_live_when_oos', 'to_order', 'created_at',
  'is_new_arrival',
  'category', 'subcategory_one', 'subcategory_two', 'subcategory_three', 'subcategory_four', 'subcategory_extra',
  'mottaro_path',
].join(', ');

// subcategory_extra is a JSON array of labels for taxonomy depth beyond
// subcategory_four (admin's api/_taxonomy-utils.js writes it the same way).
function parseSubcategoryExtra(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

const MOTTARO_HIDDEN_FILE = 'taxonomy/mottaro-hidden.json';

async function loadHiddenMottaroIds() {
  try {
    const stored = await readSiteConfigJson(MOTTARO_HIDDEN_FILE, null);
    if (Array.isArray(stored?.ids)) return stored.ids.filter((x) => typeof x === 'string' && x);
    if (Array.isArray(stored)) return stored.filter((x) => typeof x === 'string' && x);
  } catch { /* none hidden */ }
  return [];
}

async function loadTaxonomyTree() {
  const hidden = await loadHiddenMottaroIds();
  try {
    const stored = await readSiteConfigJson(TAXONOMY_FILE, null);
    let categories = null;
    if (Array.isArray(stored)) categories = stored;
    else if (stored?.categories && Array.isArray(stored.categories)) categories = stored.categories;
    if (categories?.length) return injectMotarroIntoTree(categories, hidden);
  } catch {
    // fall through to bundled
  }
  return injectMotarroIntoTree(loadBundledTaxonomy(), hidden);
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

/**
 * Adapt a stock row for the storefront.
 *
 * `placementPaths` are the product's ADDITIONAL category locations. When there
 * are none the returned object is byte-identical to before, so the payload is
 * unchanged while the feature is off.
 */
function adapt(row, tree, salesByBarcode = new Map(), placementPaths = null) {
  const images = [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four].filter(Boolean);
  const subLabels = [
    row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four,
    ...parseSubcategoryExtra(row.subcategory_extra),
  ].filter(Boolean);
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
    // Honour the admin's "Add to New Arrivals" flag so the storefront's New
    // Stock collection reflects what the admin curated (source of truth).
    isNew: !!row.is_new_arrival,
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
    // "To order" is what makes a zero-stock product ORDERABLE (with a lead-time
    // disclaimer). keep_live_when_oos only keeps it VISIBLE (shown out-of-stock).
    toOrder: !!row.to_order,
    orderableWhenOutOfStock: !!row.to_order,
    yearlySales: salesByBarcode.get(String(row.barcode || '').trim().toUpperCase()) || 0,
    createdAt: row.created_at,
    supplier: '',
  };
  const enriched = enrichMotarroCategoryFields(base, row, tree, categoryPath);
  const extras = Array.isArray(placementPaths) ? placementPaths : [];
  if (!extras.length) return enriched;

  // productMatchesNavPath already tests every entry in categoryPaths, so
  // appending placements is all the storefront needs to list the product under
  // each one. Merge rather than replace: Mottaro owns a second path here too.
  return {
    ...enriched,
    categoryPaths: mergeCategoryPaths(categoryPath, [...(enriched.categoryPaths || []), ...extras]),
    placementPaths: extras,
  };
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

    const [rows, tree, salesByBarcode, placements] = await Promise.all([
      fetchAllRows(
        supabase,
        'website_stock',
        STOCK_SELECT,
        requestedSkus?.length ? (q) => q.in('sku', requestedSkus) : null,
      ),
      loadTaxonomyTree(),
      loadSalesByBarcode(supabase, requestedSkus),
      // null when the feature is off — no extra query, payload unchanged.
      loadPlacementMapIfEnabled(supabase),
    ]);
    const products = rows
      .map((row) => adapt(row, tree, salesByBarcode, placements ? (placements.get(row.sku) || []) : null))
      // A product filed ONLY via a placement has no primary category label, so
      // it must survive this filter or multi-placement would silently drop it.
      .filter((p) => p.category
        || (p.isMultiCategory && p.alternateCategoryPath?.length)
        || p.placementPaths?.length);

    // Short edge cache so product membership / new products reflect quickly.
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(products);
  } catch (err) {
    console.error('products api error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch products' });
  }
}
