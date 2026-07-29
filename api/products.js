import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readSiteConfigJson } from './_site-config.js';
import { injectMotarroIntoTree, enrichMotarroCategoryFields } from './_mottaro-category.js';
import { loadPlacementMapIfEnabled } from './_placements.js';
import { mergeCategoryPaths } from '../lib/placements.mjs';
import { loadGroupInfoMapIfEnabled } from './_groups.js';
import { requireApprovedCustomer } from './_auth.js';

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

// ── Catalogue version + warm-instance memo ────────────────────────────────
// Building the full catalogue is expensive (paginated scan of website_stock +
// a sales lookup). It is identical for every approved customer, so we key it on
// a cheap version stamp: the newest updated_at plus the row count. Every writer
// bumps updated_at — admin edits and the ERP price/stock sync both set
// `updated_at = now()` (migrations 016 / 031) — and archive/create changes the
// count, so the stamp moves whenever the catalogue actually changes.
//
// That gives two big wins under load: repeat requests revalidate with an ETag
// and get a 304 (no rebuild, no body), and a warm lambda reuses the built
// payload instead of re-scanning for every request.
let catalogMemo = { key: null, payload: null, builtAt: 0 };
// Safety net: even if a writer ever forgets to bump updated_at, never serve a
// memoized payload for longer than this.
const CATALOG_MEMO_MAX_MS = 60_000;
// The stamp's time bucket exists because the payload is ALSO built from inputs
// (taxonomy JSON, feature flags, product_placements, product_groups,
// yearly_sales) that website_stock's updated_at does not cover — without it,
// changing one of those would pin clients on a 304 forever. But at 60s the
// bucket rotated the ETag every minute, which made 304s impossible in practice
// and re-shipped the full ~6MB catalogue on nearly every visit. 10 minutes
// bounds those secondary changes while letting unchanged catalogues answer
// 304 + empty body — stock edits still bust the ETag instantly via updated_at.
const CATALOG_MAX_STALE_MS = 10 * 60_000;

async function loadCatalogVersion(supabase) {
  const { data, count, error } = await supabase
    .from('website_stock')
    .select('updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw error;
  const newest = data?.[0]?.updated_at || '0';
  const bucket = Math.floor(Date.now() / CATALOG_MAX_STALE_MS);
  return { stamp: `${newest}|${count ?? 0}|${bucket}`, newest, count: count ?? 0 };
}

function etagMatches(req, etag) {
  const raw = req.headers['if-none-match'];
  if (!raw || !etag) return false;
  // Compare weak validators: a proxy may strip/add the W/ prefix.
  const norm = (v) => String(v).trim().replace(/^W\//, '').replace(/^"|"$/g, '');
  return String(raw)
    .split(',')
    .some((candidate) => norm(candidate) === norm(etag));
}

async function fetchAllRows(supabase, table, selectCols = '*', filter = null, maxRows = Infinity) {
  const rows = [];
  let from = 0;
  while (true) {
    const to = Math.min(from + PAGE_SIZE - 1, maxRows - 1);
    let q = supabase.from(table).select(selectCols).range(from, to);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE || rows.length >= maxRows) break;
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

// One `skus=` request is bounded so a caller cannot turn this into an
// unbounded IN(...) against the stock database. Legitimate callers (reorder,
// featured) already batch at 80.
const MAX_SKUS_PER_REQUEST = 200;

function parseSkuQuery(raw) {
  const value = Array.isArray(raw) ? raw.join(',') : String(raw || '');
  const list = value
    .split(',')
    .map((sku) => sku.trim())
    .filter(Boolean);
  if (!list.length) return null;
  return [...new Set(list)].slice(0, MAX_SKUS_PER_REQUEST);
}

function parseIdentifierQuery(raw) {
  const value = String(raw || '').trim().toUpperCase();
  if (!value || value.length < 4 || value.length > 64) return null;
  // Identifier search is intentionally strict before interpolating into a
  // PostgREST filter. Product codes are letters, digits and simple separators.
  if (!/^[A-Z0-9_-]+$/.test(value)) return null;
  return value;
}

function applyIdentifierFilter(query, identifier) {
  if (!identifier) return query;
  // Exact SKU/barcode wins. Prefix matching makes scanner fragments and a
  // partially typed supplier code useful without turning this into text search.
  return query.or(
    `sku.eq.${identifier},barcode.eq.${identifier},sku.ilike.${identifier}%,barcode.ilike.${identifier}%`,
  ).order('sku', { ascending: true });
}

/**
 * Adapt a stock row for the storefront.
 *
 * `placementPaths` are the product's ADDITIONAL category locations. When there
 * are none the returned object is byte-identical to before, so the payload is
 * unchanged while the feature is off.
 */
function adapt(row, tree, salesByBarcode = new Map(), placementPaths = null, groupInfo = null) {
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
    // Variant grouping (migration 052) — null unless catalogGrouping is on AND
    // this sku is a group member. Client-side variantGroupKey collapses on it.
    ...(groupInfo ? {
      groupId: groupInfo.groupId,
      groupPrimarySku: groupInfo.groupPrimarySku,
      variantLabel: groupInfo.variantLabel,
      groupTitle: groupInfo.groupTitle,
    } : {}),
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

  const access = await requireApprovedCustomer(req, res);
  if (!access) return;

  try {
    const requestedSkus = parseSkuQuery(req.query?.skus);
    const identifier = requestedSkus ? null : parseIdentifierQuery(req.query?.identifier);
    const supabase = createClient(
      process.env.VITE_STOCK_SUPABASE_URL,
      process.env.VITE_STOCK_SUPABASE_KEY,
    );

    // This response is per-customer authorized, so it must never be stored by a
    // SHARED cache (Vercel's CDN keys on URL, not on the Authorization header —
    // an s-maxage here could hand the protected catalogue to an unauthenticated
    // request). Private + revalidate keeps it in the user's own browser cache
    // only, and the ETag below makes that revalidation cheap.
    res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    res.setHeader('Vary', 'Authorization');

    // Full-catalogue request: the expensive path, and the one worth versioning.
    const isFullCatalog = !requestedSkus?.length && !identifier;
    let version = null;
    if (isFullCatalog) {
      // Defensive: the version stamp is an OPTIMISATION. If it can't be read we
      // must still serve the catalogue — degrade to the previous always-rebuild
      // behaviour rather than failing the request.
      try {
        version = await loadCatalogVersion(supabase);
      } catch (err) {
        console.warn('products api: catalogue version unavailable, serving uncached:', err?.message || err);
        version = null;
      }
    }
    if (isFullCatalog && version) {
      const etag = `W/"cat-${version.stamp}"`;
      res.setHeader('ETag', etag);
      // Freshness signal: how old the newest catalogue row is, so staleness
      // (e.g. a stalled ERP sync) is observable rather than silent.
      if (version.newest && version.newest !== '0') {
        res.setHeader('X-Catalog-As-Of', String(version.newest));
        const ageMs = Date.now() - new Date(version.newest).getTime();
        if (Number.isFinite(ageMs) && ageMs > 6 * 60 * 60 * 1000) {
          console.warn(`products api: catalogue stale — newest updated_at is ${Math.round(ageMs / 60000)} min old (ERP sync may be down)`);
        }
      }

      if (etagMatches(req, etag)) {
        return res.status(304).end();
      }
      if (
        catalogMemo.key === etag
        && catalogMemo.payload
        && Date.now() - catalogMemo.builtAt < CATALOG_MEMO_MAX_MS
      ) {
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(catalogMemo.payload);
      }
    }

    const [rows, tree, salesByBarcode, placements, groupInfo] = await Promise.all([
      fetchAllRows(
        supabase,
        'website_stock',
        STOCK_SELECT,
        requestedSkus?.length
          ? (q) => q.in('sku', requestedSkus)
          : identifier ? (q) => applyIdentifierFilter(q, identifier) : null,
        identifier ? 10 : Infinity,
      ),
      loadTaxonomyTree(),
      // A direct code lookup should stay direct: only fetch sales for the
      // returned codes instead of scanning the entire sales catalogue.
      loadSalesByBarcode(supabase, requestedSkus || (identifier ? [identifier] : null)),
      // null when the feature is off — no extra query, payload unchanged.
      loadPlacementMapIfEnabled(supabase),
      loadGroupInfoMapIfEnabled(supabase),
    ]);
    const products = rows
      .map((row) => adapt(
        row,
        tree,
        salesByBarcode,
        placements ? (placements.get(row.sku) || []) : null,
        groupInfo ? (groupInfo.get(row.sku) || null) : null,
      ))
      // A product filed ONLY via a placement has no primary category label, so
      // it must survive this filter or multi-placement would silently drop it.
      .filter((p) => p.category
        || (p.isMultiCategory && p.alternateCategoryPath?.length)
        || p.placementPaths?.length);

    if (isFullCatalog && version) {
      catalogMemo = { key: `W/"cat-${version.stamp}"`, payload: products, builtAt: Date.now() };
    }
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(products);
  } catch (err) {
    console.error('products api error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch products' });
  }
}
