import { supabaseStock } from './supabaseStock';
import { authHeaders } from './authHeaders';
import { fuzzyFilter } from './fuzzySearch';
import { buildCategoryPath, categoryPathToDbPatch, matchesCategoryPath } from './categoryPath';

// Promise singletons — prevents parallel fetches when multiple components mount at once
let _loadPromise = null;
let _cache = null;
let _adminLoadPromise = null;
let _adminCache = null;

// ─── localStorage cache (15 min TTL) for instant repeat page loads ────────────
const LS_KEY = 'proto_catalog_v6';
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

async function fetchJsonWithTimeout(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
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

function adapt(wpRow, stockRow) {
  const stockQty = stockRow?.stock_qty ?? 0;
  const categoryPath = buildCategoryPath(wpRow);
  const deptSlug = categoryPath[0] || '';
  return {
    id: wpRow.website_sku,
    code: wpRow.barcode,
    barcode: wpRow.barcode,
    websiteSku: wpRow.website_sku,
    parentSku: wpRow.parent_sku,
    name: wpRow.title,
    description: wpRow.description || '',
    price: Number(stockRow?.sell_price ?? 0),
    images: (wpRow.image_url || '').split(',').map((u) => u.trim()).filter(Boolean),
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
// Primary source: /products.json (static CDN file, generated at build time — fastest).
// Fallback 1: /api/products (kept only as backup if the static file misses or fails).
// Fallback 2: direct Supabase (if both above fail).
function getAllCached() {
  if (!_loadPromise) {
    const local = loadFromLocalCache();
    if (local) {
      _cache = local;
      _loadPromise = Promise.resolve(local);
    } else {
      _loadPromise = fetchJsonWithTimeout('/products.json', 12000)
        .catch(() => fetchJsonWithTimeout('/api/products', 8000))
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

function applyCollection(products, collection, specialIds = null) {
  if (collection === 'instock') return products.filter((p) => p.stockQty > 0);
  if (collection === 'soldout') return products.filter((p) => p.stockQty <= 0);
  if (collection === 'hot') return [...products].sort((a, b) => b.yearlySales - a.yearlySales);
  if (collection === 'new') return [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (collection === 'specials' && specialIds) return products.filter((p) => specialIds.has(p.id));
  return products;
}

function applyPathFilter(products, categoryPath) {
  if (!Array.isArray(categoryPath) || !categoryPath.length) return products;
  return products.filter((p) => {
    const cp = p.categoryPath || [];
    // Match by the depth of the product's own categoryPath — if products aren't yet
    // sub-categorised beyond L1, an L2 filter still returns the parent L1 results.
    const depth = Math.min(cp.length, categoryPath.length);
    return depth > 0 && categoryPath.slice(0, depth).every((seg, i) => cp[i] === seg);
  });
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
  else arr.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
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
  specialIds = null,
} = {}) {
  let products = await getAllCached();
  products = applyCollection(products, collection, specialIds);
  const hasSearch = Boolean(searchQuery.trim());
  // Active search is global — category filters apply only when browsing without a query.
  if (!hasSearch) products = applyPathFilter(products, categoryPath);
  products = hasSearch ? fuzzyFilter(products, searchQuery) : products;
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
  rows = searchQuery.trim() ? fuzzyFilter(rows, searchQuery) : rows;
  rows = [...rows].sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  const total = rows.length;
  const from = (page - 1) * pageSize;
  return { rows: rows.slice(from, from + pageSize), total, page, pageSize };
}

export async function fetchProductsByMainCategory(mainCategory, { limit = 300 } = {}) {
  return fetchProductsByCategoryPath(mainCategory ? [mainCategory] : [], { limit });
}

export async function fetchProductsByCategoryPath(categoryPath = [], { limit = 400 } = {}) {
  const all = await getAllCachedAdmin();
  let filtered = all.filter((p) => !p.isArchived);

  if (categoryPath[0] === '__unassigned__') {
    filtered = filtered.filter((p) => (p.categoryPath || []).length <= 1);
  } else if (categoryPath.length) {
    filtered = filtered.filter((p) => p.category === categoryPath[0]);
    if (categoryPath[1] === '__unassigned__') {
      filtered = filtered.filter((p) => (p.categoryPath || []).length <= 1);
    } else if (categoryPath.length > 1) {
      filtered = filtered.filter((p) => matchesCategoryPath(p.categoryPath, categoryPath));
    }
  }

  filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
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
      headers: await authHeaders(),
      body: JSON.stringify({ websiteSku, ...contentFields }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Update failed');
  }

  // Other fields (name, sortOrder, categoryPath) still go through the client
  const patch = {};
  if (payload.name        !== undefined) patch.title       = payload.name;
  if (payload.sortOrder   !== undefined) patch.sort_order  = payload.sortOrder;
  if (payload.categoryPath?.length) {
    Object.assign(patch, categoryPathToDbPatch(payload.categoryPath));
  }

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
    headers: await authHeaders(),
    body: JSON.stringify({ updates }),
  });
  const json = await res.json();
  if (!res.ok && res.status !== 207) throw new Error(json.error || 'Save failed');
  // Clear admin cache so next reorder load gets fresh DB order
  invalidateAdminCache();
}

export async function moveProductsToCategory(moves) {
  const res = await fetch('/api/move-products-category', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ moves }),
  });
  const json = await res.json();
  if (!res.ok && res.status !== 207) throw new Error(json.error || 'Move failed');
  invalidateProductCache();
  invalidateAdminCache();
  return json;
}

export async function regenerateCatalog() {
  const res = await fetch('/api/regenerate-catalog', {
    method: 'POST',
    headers: await authHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Catalog regeneration failed');
  invalidateProductCache();
  return json;
}

export async function archiveProduct() { throw new Error('Products are managed in the stock system'); }
export async function setSpecial() { throw new Error('Not supported'); }
export async function updateSortOrder() { throw new Error('Not supported'); }
export async function bulkUpsertProducts() { throw new Error('Not supported'); }
