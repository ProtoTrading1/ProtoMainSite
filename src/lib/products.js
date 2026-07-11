import { fuzzyFilter } from './fuzzySearch';
import {
  getActiveTaxonomy,
  productCountKey,
  resolveNavPathForProducts,
} from './taxonomy';
import {
  inferMotarroPathFromRow,
  isMotarroBrowsePath,
  isMotarroProduct,
  motarroPathMatchesFilter,
} from './mottaroCategory';
import { expandBarcodeSiblings, groupProductsByBarcode } from './productGroups';
import { getFeaturedProducts, invalidateFeaturedCache } from './featuredProducts';
import { applySkuOrder, lookupSortOrder } from './taxonomy';
import { preloadProductImages } from './imageUrl';

export const DEFAULT_SORT = 'featured';
const FEATURED_PRODUCTS_BATCH_SIZE = 80;

export const CATALOG_SORT_OPTIONS = [
  'featured',
  'best-selling',
  'newest',
  'price-low',
  'price-high',
  'name-asc',
  'name-desc',
];

// Promise singleton — prevents parallel fetches when multiple components mount at once
let _loadPromise = null;
let _cache = null;
let _sortOrdersPromise = null;
let _sortOrdersCache = null;
let _sortOrdersCachedAt = 0;
const SORT_ORDERS_TTL = 15_000;

// ─── localStorage cache — instant repeat loads; refreshed in background ───────
const LS_KEY = 'proto_catalog_v10';
const LS_TTL = 24 * 60 * 60 * 1000;

const _refreshListeners = new Set();

function emitCatalogRefresh() {
  for (const fn of _refreshListeners) {
    try { fn(); } catch { /* ignore */ }
  }
}

export function subscribeCatalogRefresh(fn) {
  _refreshListeners.add(fn);
  return () => _refreshListeners.delete(fn);
}

function preloadCatalogImages(products, limit = 60) {
  if (!products?.length) return;
  const sorted = sortCatalogProducts(products, DEFAULT_SORT);
  preloadProductImages(
    sorted.slice(0, limit).map((p) => p.image || p.localImage),
    { limit },
  );
}

/** Start catalogue fetch early (e.g. on login) so data is ready before App mounts. */
export function prefetchCatalog() {
  const stale = loadFromLocalCache();
  if (stale?.length) preloadCatalogImages(stale);
  void getAllCached().then((products) => preloadCatalogImages(products));
}

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
function startCatalogFetch() {
  return fetchJsonWithTimeout('/api/products', 12000, { cache: 'no-store' })
    .catch(() => fetchJsonWithTimeout('/products.json', 12000))
    .catch(() => {
      const local = loadFromLocalCache();
      if (local) return local;
      throw new Error('Catalogue unavailable');
    })
    .then((products) => {
      const hadPrior = !!_cache;
      _cache = products;
      saveToLocalCache(products);
      if (hadPrior) emitCatalogRefresh();
      return _cache;
    })
    .catch((err) => {
      _loadPromise = null;
      throw err;
    });
}

function getAllCached() {
  if (!_cache) {
    const stale = loadFromLocalCache();
    if (stale) _cache = stale;
  }

  if (!_loadPromise) {
    _loadPromise = startCatalogFetch();
  }

  if (_cache) return Promise.resolve(_cache);
  return _loadPromise;
}

export function invalidateProductCache() {
  _cache = null;
  _loadPromise = null;
  _sortOrdersCache = null;
  _sortOrdersCachedAt = 0;
  _sortOrdersPromise = null;
  invalidateFeaturedCache();
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

function productSkuKey(product) {
  return String(product.sku || product.code || product.websiteSku || '').toUpperCase();
}

function chunkArray(items, size) {
  if (!Array.isArray(items) || !items.length) return [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchFeaturedCatalogProducts() {
  const featuredSkus = await getFeaturedProducts();
  if (!featuredSkus.length) return [];

  try {
    const batches = chunkArray(featuredSkus, FEATURED_PRODUCTS_BATCH_SIZE);
    const responses = await Promise.all(
      batches.map((batch) => fetchJsonWithTimeout(
        `/api/products?skus=${encodeURIComponent(batch.join(','))}`,
        10000,
        { cache: 'no-store' },
      )),
    );

    const bySku = new Map();
    for (const product of responses.flat()) {
      const key = productSkuKey(product);
      if (key && !bySku.has(key)) bySku.set(key, product);
    }

    return featuredSkus
      .map((sku) => bySku.get(String(sku || '').toUpperCase()))
      .filter(Boolean);
  } catch {
    // Fall back to cached full catalogue when the fast SKU request path fails.
    const allProducts = await getAllCached();
    const bySku = new Map(allProducts.map((product) => [productSkuKey(product), product]));
    return featuredSkus
      .map((sku) => bySku.get(String(sku || '').toUpperCase()))
      .filter(Boolean);
  }
}


export async function fetchDistinctCategories() {
  const all = await getAllCached();
  return [...new Set(all.map((p) => p.categoryLabel).filter(Boolean))].sort();
}

// ─── Filtering / sorting helpers ──────────────────────────────────────────────

/**
 * Explicit admin "To order" flag: product is orderable even at zero stock.
 * This is DISTINCT from keep_live_when_oos (which only keeps a zero-stock
 * product visible/shown as out-of-stock). Only a "to order" product can be
 * bought when out of stock.
 */
export function isOrderableWhenOutOfStock(product) {
  if (!product) return false;
  return product.toOrder === true
    || product.to_order === true
    || product.orderableWhenOutOfStock === true
    || product.orderable_when_out_of_stock === true;
}

function productStockQty(product) {
  const qtyRaw = product.stockOnHand ?? product.stockQty ?? product.available_stock ?? product.stock_qty;
  if (qtyRaw === undefined || qtyRaw === null) return null;
  return Number(qtyRaw) || 0;
}

/**
 * Whether a single product row is available to buy (pre-grouping).
 * Canonical rule shared with the admin's isPublishableOnWebsite
 * (protoportal-admin lib/catalog-stock.mjs): only EXACTLY-zero stock is
 * unavailable (unless keep_live_when_oos); negative SOH stays available —
 * backorder lines are live and orderable by business rule.
 */
export function isProductAvailable(product) {
  if (!product) return false;
  const qty = productStockQty(product);
  if (qty !== null && qty !== 0) return true;
  if (isOrderableWhenOutOfStock(product)) return true;
  if (qty !== null) return false;
  if (product.inStock === false) return false;
  return true;
}

function applyInStockFilter(products, inStockOnly) {
  if (!inStockOnly) return products;
  return products.filter(isProductAvailable);
}

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

function productRowForMotarro(product) {
  return {
    title: product.title || product.name || '',
    category: product.categoryLabel || '',
    subcategory_one: product.subcategoryLabels?.[0] ?? null,
    subcategory_two: product.subcategoryLabels?.[1] ?? null,
    subcategory_three: product.subcategoryLabels?.[2] ?? null,
    subcategory_four: product.subcategoryLabels?.[3] ?? null,
    mottaro_path: product.mottaroPath ?? product.mottaro_path ?? null,
  };
}

function productMatchesNavPath(product, tree, navPath) {
  if (!Array.isArray(navPath) || !navPath.length) return true;

  if (isMotarroBrowsePath(navPath)) {
    if (!isMotarroProduct(product)) return false;
    const mottaroPath = product.alternateCategoryPath?.length
      ? product.alternateCategoryPath
      : inferMotarroPathFromRow(productRowForMotarro(product), tree);
    return motarroPathMatchesFilter(mottaroPath, navPath);
  }

  const resolved = resolveNavPathForProducts(navPath, tree);
  if (!resolved.length) return true;
  // The nav path must be a PREFIX of the product path: the product has to be
  // filed at least as deep as the browsed node and match every segment. Using
  // Math.min here let a shallow product (e.g. filed only at a department or an
  // L1 subcategory) leak into every leaf beneath it — that broke the live
  // reflection (leaves showed products the admin never put there). Admin
  // filters with exact per-level SQL, so this matches it.
  return productPaths(product).some((cp) =>
    cp.length >= resolved.length && resolved.every((seg, i) => cp[i] === seg));
}

function applyPathFilter(products, categoryPath) {
  if (!Array.isArray(categoryPath) || !categoryPath.length) return products;
  const tree = getActiveTaxonomy();
  if (tree.length) {
    return products.filter((p) => productMatchesNavPath(p, tree, categoryPath));
  }
  const resolved = resolveNavPathForProducts(categoryPath, tree);
  if (!resolved.length) return products;
  return products.filter((p) => productPaths(p).some((cp) =>
    cp.length >= resolved.length && resolved.every((seg, i) => cp[i] === seg)));
}

function compareByPrice(a, b, descending = false) {
  const pa = Number(a.price) || 0;
  const pb = Number(b.price) || 0;
  if (pa === 0 && pb === 0) return 0;
  if (pa === 0) return 1;
  if (pb === 0) return -1;
  return descending ? pb - pa : pa - pb;
}

export function normalizeCatalogSort(sort) {
  return CATALOG_SORT_OPTIONS.includes(sort) ? sort : DEFAULT_SORT;
}

function compareByName(a, b, descending = false) {
  const na = String(a.name || a.title || '').trim();
  const nb = String(b.name || b.title || '').trim();
  const cmp = na.localeCompare(nb, undefined, { sensitivity: 'base' });
  return descending ? -cmp : cmp;
}

/** Sort catalogue rows. During search, featured/best-selling preserve fuzzy relevance order. */
export function sortCatalogProducts(products, sort = DEFAULT_SORT, { hasSearch = false } = {}) {
  const mode = normalizeCatalogSort(sort);
  const arr = [...products];

  if (hasSearch && (mode === 'featured' || mode === 'best-selling')) return arr;

  if (mode === 'featured') {
    arr.sort((a, b) => {
      const diff = (Number(b.yearlySales) || 0) - (Number(a.yearlySales) || 0);
      if (diff !== 0) return diff;
      return compareByName(a, b, false);
    });
    return arr;
  }

  if (mode === 'price-low') {
    arr.sort((a, b) => compareByPrice(a, b, false));
    return arr;
  }
  if (mode === 'price-high') {
    arr.sort((a, b) => compareByPrice(a, b, true));
    return arr;
  }
  if (mode === 'newest') {
    arr.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return arr;
  }
  if (mode === 'name-asc') {
    arr.sort((a, b) => compareByName(a, b, false));
    return arr;
  }
  if (mode === 'name-desc') {
    arr.sort((a, b) => compareByName(a, b, true));
    return arr;
  }

  arr.sort((a, b) => {
    const diff = (Number(b.yearlySales) || 0) - (Number(a.yearlySales) || 0);
    if (diff !== 0) return diff;
    return compareByName(a, b, false);
  });
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
  sort = DEFAULT_SORT,
  specialIds = null,
  inStockOnly = false,
} = {}) {
  const normalizedSort = normalizeCatalogSort(sort);
  const hasSearch = Boolean(searchQuery.trim());
  const isHomeFeatured = normalizedSort === 'featured'
    && categoryPath.length === 0
    && collection === 'all'
    && !hasSearch;

  if (isHomeFeatured) {
    let products = await fetchFeaturedCatalogProducts();
    products = applyInStockFilter(products, inStockOnly);
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

  let products = await getAllCached();
  const pool = products;
  products = applyCollection(products, collection, specialIds);
  if (!hasSearch) products = applyPathFilter(products, categoryPath);
  if (hasSearch) products = expandBarcodeSiblings(pool, fuzzyFilter(products, searchQuery));

  if (normalizedSort === 'featured' && categoryPath.length && !hasSearch) {
    const sortOrders = await getSortOrders();
    const skuOrder = lookupSortOrder(sortOrders, categoryPath, getActiveTaxonomy());
    products = skuOrder?.length ? applySkuOrder(products, skuOrder) : sortCatalogProducts(products, 'best-selling');
  } else {
    products = sortCatalogProducts(products, normalizedSort, { hasSearch });
  }

  products = applyInStockFilter(products, inStockOnly);
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

function collectTaxonomyNavPaths(nodes, prefix = [], out = []) {
  for (const node of nodes || []) {
    const path = [...prefix, node.id];
    out.push(path);
    if (node.children?.length) collectTaxonomyNavPaths(node.children, path, out);
  }
  return out;
}

export async function fetchCategoryCounts({ collection = 'all', inStockOnly = false } = {}) {
  let products = await getAllCached();
  products = applyCollection(products, collection);
  products = applyInStockFilter(products, inStockOnly);
  products = groupProductsByBarcode(products);
  const tree = getActiveTaxonomy();
  const counts = { '': products.length };

  for (const navPath of collectTaxonomyNavPaths(tree)) {
    const count = products.filter((p) => productMatchesNavPath(p, tree, navPath)).length;
    if (count <= 0) continue;
    const key = productCountKey(navPath, tree);
    counts[key] = count;
    const legacyKey = navPath.join('/');
    if (legacyKey && legacyKey !== key) counts[legacyKey] = count;
  }

  return counts;
}
