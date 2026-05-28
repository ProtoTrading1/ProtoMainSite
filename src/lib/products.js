import { supabaseStock } from './supabaseStock';

// Promise singletons — prevents parallel fetches when multiple components mount at once
let _loadPromise = null;
let _cache = null;
let _adminLoadPromise = null;
let _adminCache = null;

// ─── localStorage cache (15 min TTL) for instant repeat page loads ────────────
const LS_KEY = 'proto_catalog_v4';
const LS_TTL = 15 * 60 * 1000;

function saveToLocalCache(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}
function loadFromLocalCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return (Date.now() - ts < LS_TTL) ? data : null;
  } catch { return null; }
}

const PAGE_SIZE = 1000;

async function fetchAllRows(table, selectCols = '*', extraFilter = null, orderBy = null) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = supabaseStock.from(table).select(selectCols);
    if (orderBy) q = q.order(orderBy, { ascending: true });
    q = q.range(from, from + PAGE_SIZE - 1);
    if (extraFilter) q = extraFilter(q);
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
  const categoryPath = deptSlug ? [deptSlug] : [];
  return {
    id: wpRow.website_sku,
    code: wpRow.barcode,
    barcode: wpRow.barcode,
    websiteSku: wpRow.website_sku,
    parentSku: wpRow.parent_sku,
    name: wpRow.title,
    description: wpRow.description || '',
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

async function loadAllFromDB({ includeInactive = false, onProgress } = {}) {
  onProgress?.(8);
  // Fetch both tables in parallel — no huge .in() filter, join client-side
  // sort_order only exists on website_products, NOT on products (stock table)
  const [wpRows, stockRows] = await Promise.all([
    fetchAllRows('website_products', '*', includeInactive ? null : (q) => q.eq('active', true), 'sort_order').then((r) => { onProgress?.(55); return r; }),
    fetchAllRows('products', 'sku,sell_price,stock_qty,yearly_sales,supplier').then((r) => { onProgress?.(85); return r; }),
  ]);

  const stockMap = {};
  for (const s of stockRows) stockMap[s.sku] = s;

  onProgress?.(100);
  return wpRows.map((wp) => adapt(wp, stockMap[wp.barcode]));
}

// Admin cache — includes inactive products; cached for the session
function getAllCachedAdmin(onProgress) {
  if (_adminCache) {
    onProgress?.(100);
    return Promise.resolve(_adminCache);
  }
  if (!_adminLoadPromise) {
    _adminLoadPromise = loadAllFromDB({ includeInactive: true, onProgress })
      .then((all) => {
        _adminCache = all;
        return _adminCache;
      })
      .catch((err) => {
        _adminLoadPromise = null;
        throw err;
      });
  }
  return _adminLoadPromise;
}

export async function fetchDistinctCategories() {
  const all = await getAllCached();
  return [...new Set(all.map((p) => p.category).filter(Boolean))].sort();
}

// Returns only in-stock, categorized, imaged products for the customer catalog.
// Primary source: /products.json (static CDN file, generated at build time — instant).
// Fallback 1: /api/products (edge-cached Vercel function — ~200ms warm).
// Fallback 2: direct Supabase (if both above fail).
function getAllCached() {
  if (!_loadPromise) {
    const local = loadFromLocalCache();
    if (local) {
      _cache = local;
      _loadPromise = Promise.resolve(local);
    } else {
      _loadPromise = fetch('/api/products')
        .then((r) => {
          if (!r.ok) throw new Error(`API ${r.status}`);
          return r.json();
        })
        .catch(() => fetch('/products.json').then((r) => {
          if (!r.ok) throw new Error(`products.json ${r.status}`);
          return r.json();
        }))
        .then((products) => {
          _cache = products;
          saveToLocalCache(products);
          return _cache;
        })
        .catch(() => loadAllFromDB()
          .then((all) => {
            _cache = all.filter((p) => p.stockQty > 0 && p.category && p.image);
            saveToLocalCache(_cache);
            return _cache;
          }))
        .catch((err) => {
          _loadPromise = null;
          throw err;
        });
    }
  }
  return _loadPromise;
}

export function invalidateProductCache() {
  _cache = null;
  _loadPromise = null;
  _adminCache = null;
  _adminLoadPromise = null;
  try { localStorage.removeItem(LS_KEY); } catch {}
}

// Clears only the admin cache — use this for admin panel refreshes so the
// public catalog cache and localStorage are left intact.
export function invalidateAdminCache() {
  _adminCache = null;
  _adminLoadPromise = null;
}

// Live stock check — always a fresh single-row query
export async function checkStock(barcode) {
  const { data, error } = await supabaseStock
    .from('products')
    .select('stock_qty')
    .eq('sku', barcode)
    .maybeSingle();
  if (error) throw error;
  return data?.stock_qty ?? 0;
}

// ─── Filtering / sorting helpers ──────────────────────────────────────────────

function applyCollection(products, collection) {
  if (collection === 'instock') return products.filter((p) => p.stockQty > 0);
  if (collection === 'soldout') return products.filter((p) => p.stockQty <= 0);
  if (collection === 'hot') return [...products].sort((a, b) => b.yearlySales - a.yearlySales);
  if (collection === 'new') return [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return products;
}

function applyPathFilter(products, categoryPath) {
  if (!Array.isArray(categoryPath) || !categoryPath.length) return products;
  return products.filter((p) => categoryPath.every((seg, i) => p.categoryPath[i] === seg));
}

function applySearchFilter(products, searchQuery) {
  const q = searchQuery?.trim().toLowerCase();
  if (!q) return products;
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.websiteSku || '').toLowerCase().includes(q) ||
      (p.parentSku || '').toLowerCase().includes(q)
  );
}

function applySort(products, sort) {
  const arr = [...products];
  if (sort === 'price-low') arr.sort((a, b) => a.price - b.price);
  else if (sort === 'price-high') arr.sort((a, b) => b.price - a.price);
  else if (sort === 'latest') arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  else if (sort === 'stock') arr.sort((a, b) => b.stockQty - a.stockQty);
  return arr;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function fetchProducts() {
  return getAllCached();
}

export async function fetchProductPage({
  page = 1,
  pageSize = 60,
  searchQuery = '',
  categoryPath = [],
  collection = 'all',
  sort = 'featured',
} = {}) {
  let products = await getAllCached();
  products = applyCollection(products, collection);
  products = applyPathFilter(products, categoryPath);
  products = applySearchFilter(products, searchQuery);
  products = applySort(products, sort);

  const total = products.length;
  const from = (page - 1) * pageSize;
  return {
    products: products.slice(from, from + pageSize),
    total,
    page,
    pageSize,
    hasMore: total > from + pageSize,
  };
}

export async function fetchCategoryCounts({ collection = 'all' } = {}) {
  let products = await getAllCached();
  products = applyCollection(products, collection);
  const counts = { '': products.length };
  for (const p of products) {
    const cp = p.categoryPath;
    if (!cp?.length) continue;
    for (let i = 1; i <= cp.length; i++) {
      const key = cp.slice(0, i).join('/');
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

export async function fetchAllProductsAdmin({ onProgress } = {}) {
  return getAllCachedAdmin(onProgress);
}

export async function fetchAdminProductsPage({
  page = 1,
  pageSize = 50,
  searchQuery = '',
  includeArchived = false,
  zeroStockOnly = false,
  categoryFilter = '',
  onProgress,
} = {}) {
  let rows = await fetchAllProductsAdmin({ onProgress });
  if (!includeArchived) rows = rows.filter((p) => !p.isArchived);
  // Product Manager shows live (in-stock) products; Archive shows zero-stock
  if (zeroStockOnly) rows = rows.filter((p) => p.stockQty === 0);
  else rows = rows.filter((p) => p.stockQty > 0);
  if (categoryFilter && categoryFilter !== 'all') rows = rows.filter((p) => p.category === categoryFilter);
  rows = applySearchFilter(rows, searchQuery);
  rows = [...rows].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  const total = rows.length;
  const from = (page - 1) * pageSize;
  return { rows: rows.slice(from, from + pageSize), total, page, pageSize };
}

export async function fetchProductsByMainCategory(mainCategory, { limit = 300 } = {}) {
  const all = await getAllCached();
  const filtered = mainCategory && mainCategory !== 'all'
    ? all.filter((p) => p.category === mainCategory)
    : all;
  return filtered.slice(0, limit);
}

export async function exportProductsCsv() {
  return fetchAllProductsAdmin();
}

export async function createProduct() { throw new Error('Products are managed in the stock system'); }

export async function updateProduct(websiteSku, payload) {
  // Image and description go through the server-side endpoint (service-role key, no RLS)
  const contentFields = {};
  if (payload.image       !== undefined) contentFields.image       = payload.image;
  if (payload.description !== undefined) contentFields.description = payload.description;

  if (Object.keys(contentFields).length) {
    const res = await fetch('/api/update-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ websiteSku, ...contentFields }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Update failed');
  }

  // Other fields (name, sortOrder, categoryPath) still go through the client
  const patch = {};
  if (payload.name        !== undefined) patch.title      = payload.name;
  if (payload.sortOrder   !== undefined) patch.sort_order = payload.sortOrder;
  if (payload.categoryPath?.length)      patch.category   = payload.categoryPath[0];

  if (Object.keys(patch).length) {
    const { error } = await supabaseStock
      .from('website_products')
      .update(patch)
      .eq('website_sku', websiteSku);
    if (error) throw error;
  }

  invalidateProductCache();
}

export async function saveSortOrder(updates) {
  // updates: [{ websiteSku, sortOrder }]
  const res = await fetch('/api/save-sort-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });
  const json = await res.json();
  if (!res.ok && res.status !== 207) throw new Error(json.error || 'Save failed');
  // Clear admin cache so next reorder load gets fresh DB order
  invalidateAdminCache();
}

export async function archiveProduct() { throw new Error('Products are managed in the stock system'); }
export async function setSpecial() { throw new Error('Not supported'); }
export async function updateSortOrder() { throw new Error('Not supported'); }
export async function bulkUpsertProducts() { throw new Error('Not supported'); }
