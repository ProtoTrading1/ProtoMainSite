import { fuzzyFilter } from './fuzzySearch';
import {
  applySkuOrder,
  getActiveTaxonomy,
  lookupSortOrder,
  resolveNavPathForProducts,
} from './taxonomy';
import {
  inferMotarroPathFromRow,
  isMotarroBrowsePath,
  isMotarroProduct,
  motarroPathMatchesFilter,
} from './mottaroCategory';
import { expandBarcodeSiblings, groupProductsByBarcode } from './productGroups';

// Promise singleton — prevents parallel fetches when multiple components mount at once
let _loadPromise = null;
let _cache = null;
let _sortOrdersPromise = null;
let _sortOrdersCache = null;
let _sortOrdersCachedAt = 0;
const SORT_ORDERS_TTL = 15_000;

// ─── localStorage cache (5 min TTL) for instant repeat page loads ────────────
const LS_KEY = 'proto_catalog_v10';
const LS_TTL = 90 * 1000;

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

async function fetchJsonWithTimeout(url, timeoutMs = 4500, { cache } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: 'same-origin',
      ...(cache ? { cache } : {}),
    });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Customer catalogue: live /api/products first (includes admin price edits).
// Fallbacks: static products.json, then localStorage.
function getAllCached() {
  if (!_loadPromise) {
    _loadPromise = fetchJsonWithTimeout('/api/products', 12000, { cache: 'no-store' })
      .catch(() => fetchJsonWithTimeout('/products.json', 12000))
      .catch(() => {
        const local = loadFromLocalCache();
        if (local) return local;
        throw new Error('Catalogue unavailable');
      })
      .then((products) => {
        _cache = products;
        saveToLocalCache(products);
        return _cache;
      })
      .catch((err) => {
        _loadPromise = null;
        throw err;
      });
  }
  return _loadPromise;
}

export function invalidateProductCache() {
  _cache = null;
  _loadPromise = null;
  _sortOrdersCache = null;
  _sortOrdersCachedAt = 0;
  _sortOrdersPromise = null;
  try { localStorage.removeItem(LS_KEY); } catch {}
}

async function getSortOrders() {
  if (_sortOrdersCache && Date.now() - _sortOrdersCachedAt < SORT_ORDERS_TTL) return _sortOrdersCache;
  _sortOrdersCache = null;
  if (!_sortOrdersPromise) {
    _sortOrdersPromise = fetchJsonWithTimeout('/api/sort-orders', 8000, { cache: 'no-store' })
      .then((store) => {
        _sortOrdersCache = store?.orders || {};
        _sortOrdersCachedAt = Date.now();
        _sortOrdersPromise = null;
        return _sortOrdersCache;
      })
      .catch(() => {
        _sortOrdersPromise = null;
        return {};
      });
  }
  return _sortOrdersPromise;
}

export async function fetchDistinctCategories() {
  const all = await getAllCached();
  return [...new Set(all.map((p) => p.categoryLabel).filter(Boolean))].sort();
}

// ─── Filtering / sorting helpers ──────────────────────────────────────────────

function applyCollection(products, collection, specialIds = null) {
  // Stock-based collections are no-ops in catalogue-only mode.
  if (collection === 'hot') return [...products].sort((a, b) => b.yearlySales - a.yearlySales);
  if (collection === 'new') return [...products].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (collection === 'specials' && specialIds) return products.filter((p) => specialIds.has(p.id));
  return products;
}

function productPaths(product) {
  if (product.categoryPaths?.length) return product.categoryPaths;
  if (product.categoryPath?.length) return [product.categoryPath];
  return [];
}

function productMatchesNavPath(product, tree, navPath) {
  if (!Array.isArray(navPath) || !navPath.length) return true;

  if (isMotarroBrowsePath(navPath)) {
    if (!isMotarroProduct(product)) return false;
    const row = {
      title: product.title || product.name || '',
      category: product.categoryLabel || '',
      subcategory_one: product.subcategoryLabels?.[0] ?? null,
      subcategory_two: product.subcategoryLabels?.[1] ?? null,
      subcategory_three: product.subcategoryLabels?.[2] ?? null,
      subcategory_four: product.subcategoryLabels?.[3] ?? null,
    };
    const mottaroPath = product.alternateCategoryPath?.length
      ? product.alternateCategoryPath
      : inferMotarroPathFromRow(row, tree);
    return motarroPathMatchesFilter(mottaroPath, navPath);
  }

  const resolved = resolveNavPathForProducts(navPath, tree);
  return productPaths(product).some((cp) => {
    const depth = Math.min(cp.length, resolved.length);
    return depth > 0 && resolved.slice(0, depth).every((seg, i) => cp[i] === seg);
  });
}

function applyPathFilter(products, categoryPath) {
  if (!Array.isArray(categoryPath) || !categoryPath.length) return products;
  const tree = getActiveTaxonomy();
  if (tree.length) {
    return products.filter((p) => productMatchesNavPath(p, tree, categoryPath));
  }
  const resolved = resolveNavPathForProducts(categoryPath, tree);
  return products.filter((p) => productPaths(p).some((cp) => {
    const depth = Math.min(cp.length, resolved.length);
    return depth > 0 && resolved.slice(0, depth).every((seg, i) => cp[i] === seg);
  }));
}

function applySort(products, sort, categoryPath = [], sortOrders = {}, hasSearch = false) {
  const arr = [...products];
  if (sort === 'latest') arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sort === 'featured' && categoryPath.length && !hasSearch) {
    const skuOrder = lookupSortOrder(sortOrders, categoryPath, getActiveTaxonomy());
    if (skuOrder?.length) return applySkuOrder(arr, skuOrder);
  }
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
  const sortOrders = await getSortOrders();
  const pool = products;
  products = applyCollection(products, collection, specialIds);
  const hasSearch = Boolean(searchQuery.trim());
  if (!hasSearch) products = applyPathFilter(products, categoryPath);
  if (hasSearch) products = expandBarcodeSiblings(pool, fuzzyFilter(products, searchQuery));
  products = applySort(products, sort, categoryPath, sortOrders, hasSearch);
  products = groupProductsByBarcode(products);

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
  products = groupProductsByBarcode(products);
  const tree = getActiveTaxonomy();
  const counts = { '': products.length };
  for (const p of products) {
    for (const path of productPaths(p)) {
      const countPath = path[0] === 'mottaro'
        ? resolveNavPathForProducts(path, tree)
        : path;
      if (!countPath.length) continue;
      for (let i = 1; i <= countPath.length; i++) {
        const key = countPath.slice(0, i).join('/');
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }
  return counts;
}
