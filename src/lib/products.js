import { fuzzyFilter } from './fuzzySearch';
import { applySkuOrder, getActiveTaxonomy, lookupSortOrder, resolveNavPathForProducts } from './taxonomy';

// Promise singleton — prevents parallel fetches when multiple components mount at once
let _loadPromise = null;
let _cache = null;
let _sortOrdersPromise = null;
let _sortOrdersCache = null;
let _sortOrdersCachedAt = 0;
const SORT_ORDERS_TTL = 45_000;

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

function applyPathFilter(products, categoryPath) {
  if (!Array.isArray(categoryPath) || !categoryPath.length) return products;
  const resolved = resolveNavPathForProducts(categoryPath, getActiveTaxonomy());
  return products.filter((p) => {
    const cp = p.categoryPath || [];
    const depth = Math.min(cp.length, resolved.length);
    return depth > 0 && resolved.slice(0, depth).every((seg, i) => cp[i] === seg);
  });
}

function applySort(products, sort, categoryPath = [], sortOrders = {}) {
  const arr = [...products];
  if (sort === 'latest') arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sort === 'featured' && categoryPath.length) {
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
  products = applyCollection(products, collection, specialIds);
  const hasSearch = Boolean(searchQuery.trim());
  if (!hasSearch) products = applyPathFilter(products, categoryPath);
  products = hasSearch ? fuzzyFilter(products, searchQuery) : products;
  products = applySort(products, sort, categoryPath, sortOrders);

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
