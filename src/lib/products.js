import { supabaseStock } from './supabaseStock';
import { fuzzyFilter } from './fuzzySearch';
import { buildCategoryPath, labelToSlug, slugToLabel } from './taxonomy';

function matchesMainCategory(product, mainCategory) {
  if (!mainCategory || mainCategory === 'all') return true;
  const resolvedLabel = slugToLabel(mainCategory);
  return (
    product.category === mainCategory
    || product.categoryLabel === mainCategory
    || product.categoryLabel === resolvedLabel
    || labelToSlug(product.categoryLabel || '') === mainCategory
  );
}

// Promise singletons — prevents parallel fetches when multiple components mount at once
let _loadPromise = null;
let _cache = null;
let _adminLoadPromise = null;
let _adminCache = null;

// ─── localStorage cache (15 min TTL) for instant repeat page loads ────────────
const LS_KEY = 'proto_catalog_v7';
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

// Adapts a website_stock / archived_products row into the app's product shape.
// Catalogue-only: there is no price or stock — those fields are kept as safe
// zero-defaults so cart/order math never throws on NULL/undefined.
function adapt(row, { archived = false } = {}) {
  const images = [row.image_url_one, row.image_url_two, row.image_url_three, row.image_url_four].filter(Boolean);
  const subLabels = [row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four].filter(Boolean);
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
    price: 0,
    images,
    image: images[0] || '',
    secondaryImage: images[1] || '',
    stockQty: 0,
    stockOnHand: 0,
    colour: '',
    category: labelToSlug(row.category),
    categoryLabel: row.category,
    categoryPath: buildCategoryPath(row.category, subLabels),
    subcategoryLabels: subLabels,
    tags: [],
    badges: [],
    isNew: false,
    isSpecial: false,
    isArchived: archived,
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

async function loadLiveFromDB({ onProgress } = {}) {
  onProgress?.(10);
  const rows = await fetchAllRows('website_stock', '*', null, 'title');
  onProgress?.(100);
  return rows.map((r) => adapt(r));
}

async function loadArchivedFromDB() {
  const rows = await fetchAllRows('archived_products', '*', null, 'archived_at');
  return rows.map((r) => adapt(r, { archived: true }));
}

// Admin cache — live website_stock products; cached for the session
function getAllCachedAdmin(onProgress) {
  if (_adminCache) {
    onProgress?.(100);
    return Promise.resolve(_adminCache);
  }
  if (!_adminLoadPromise) {
    _adminLoadPromise = loadLiveFromDB({ onProgress })
      .then((all) => { _adminCache = all; return _adminCache; })
      .catch((err) => { _adminLoadPromise = null; throw err; });
  }
  return _adminLoadPromise;
}

export async function fetchDistinctCategories() {
  const all = await getAllCachedAdmin();
  return [...new Set(all.map((p) => p.categoryLabel).filter(Boolean))].sort();
}

// Customer catalogue: categorised products from website_stock.
// Primary source: /products.json (static, build-time). Fallbacks: /api/products, then DB.
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
        .catch(() => loadLiveFromDB()
          .then((all) => {
            _cache = all.filter((p) => p.category);
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

export function invalidateAdminCache() {
  _adminCache = null;
  _adminLoadPromise = null;
}

// ─── Filtering / sorting helpers ──────────────────────────────────────────────

function applyCollection(products, collection, specialIds = null) {
  // Stock-based collections are no-ops in catalogue-only mode.
  if (collection === 'hot') return [...products].sort((a, b) => b.yearlySales - a.yearlySales);
  if (collection === 'new') return [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (collection === 'specials' && specialIds) return products.filter((p) => specialIds.has(p.id));
  return products;
}

function applyPathFilter(products, categoryPath) {
  if (!Array.isArray(categoryPath) || !categoryPath.length) return products;
  return products.filter((p) => {
    const cp = p.categoryPath || [];
    const depth = Math.min(cp.length, categoryPath.length);
    return depth > 0 && categoryPath.slice(0, depth).every((seg, i) => cp[i] === seg);
  });
}

function applySort(products, sort) {
  const arr = [...products];
  if (sort === 'latest') arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
  archived = false,
  categoryFilter = '',
  onProgress,
} = {}) {
  let rows = archived ? await loadArchivedFromDB() : await fetchAllProductsAdmin({ onProgress });
  if (categoryFilter && categoryFilter !== 'all') {
    rows = rows.filter((p) => matchesMainCategory(p, categoryFilter));
  }
  rows = searchQuery.trim() ? fuzzyFilter(rows, searchQuery) : rows;
  rows = [...rows].sort((a, b) => (a.categoryLabel || '').localeCompare(b.categoryLabel || '') || a.name.localeCompare(b.name));
  const total = rows.length;
  const from = (page - 1) * pageSize;
  return { rows: rows.slice(from, from + pageSize), total, page, pageSize };
}

export async function fetchProductsByMainCategory(mainCategory, { limit = 10000, onProgress } = {}) {
  const all = await getAllCachedAdmin(onProgress);
  const filtered = mainCategory && mainCategory !== 'all'
    ? all.filter((p) => matchesMainCategory(p, mainCategory))
    : all;
  return filtered
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}

export async function exportProductsCsv() {
  return fetchAllProductsAdmin();
}

// ─── Admin writes (stock key is service-role; RLS bypassed) ─────────────────────

function normalizeWriteRow(payload) {
  return {
    sku: payload.sku?.trim(),
    barcode: payload.barcode?.trim(),
    title: payload.title?.trim(),
    original_description: (payload.originalDescription ?? payload.title ?? '').trim(),
    image_url_one: payload.imageOne?.trim() || null,
    image_url_two: payload.imageTwo?.trim() || null,
    category: payload.category,
    subcategory_one: payload.subcategoryOne,
    subcategory_two: payload.subcategoryTwo || null,
    subcategory_three: payload.subcategoryThree || null,
    subcategory_four: payload.subcategoryFour || null,
  };
}

export async function createProduct(payload) {
  const row = normalizeWriteRow(payload);
  if (!row.sku || !row.barcode || !row.title || !row.category || !row.subcategory_one) {
    throw new Error('SKU, barcode, title, category and subcategory one are required');
  }
  const { error } = await supabaseStock.from('website_stock').insert(row);
  if (error) throw error;
  invalidateProductCache();
}

export async function updateProduct(sku, payload) {
  const patch = {};
  if (payload.barcode !== undefined) patch.barcode = payload.barcode;
  if (payload.title !== undefined) patch.title = payload.title;
  if (payload.originalDescription !== undefined) patch.original_description = payload.originalDescription;
  if (payload.imageOne !== undefined) patch.image_url_one = payload.imageOne || null;
  if (payload.imageTwo !== undefined) patch.image_url_two = payload.imageTwo || null;
  if (payload.category !== undefined) patch.category = payload.category;
  if (payload.subcategoryOne !== undefined) patch.subcategory_one = payload.subcategoryOne;
  if (payload.subcategoryTwo !== undefined) patch.subcategory_two = payload.subcategoryTwo || null;
  if (payload.subcategoryThree !== undefined) patch.subcategory_three = payload.subcategoryThree || null;
  if (payload.subcategoryFour !== undefined) patch.subcategory_four = payload.subcategoryFour || null;

  if (!Object.keys(patch).length) return;
  patch.updated_at = new Date().toISOString();
  const { error } = await supabaseStock.from('website_stock').update(patch).eq('sku', sku);
  if (error) throw error;
  invalidateProductCache();
}

export async function archiveProduct(sku, by = null) {
  const { error } = await supabaseStock.rpc('archive_product', { p_sku: sku, p_by: by });
  if (error) throw error;
  invalidateProductCache();
  invalidateAdminCache();
}

export async function unarchiveProduct(sku) {
  const { error } = await supabaseStock.rpc('unarchive_product', { p_sku: sku });
  if (error) throw error;
  invalidateProductCache();
  invalidateAdminCache();
}

// Catalogue-only mode: no live stock and no manual sort_order column.
export async function checkStock() { return null; }
export async function saveSortOrder() { /* no-op: website_stock has no sort_order */ }
export async function setSpecial() { throw new Error('Not supported'); }
export async function updateSortOrder() { throw new Error('Not supported'); }
export async function bulkUpsertProducts() { throw new Error('Not supported'); }
