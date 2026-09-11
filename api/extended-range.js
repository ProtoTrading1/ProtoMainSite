import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
import { customerFacingCataloguePrice } from '../lib/catalogue-price.mjs';
import { evaluateInstoreDuplicate } from '../lib/instore-duplicate-gate.mjs';
import { compareInstoreSearch, discoveryGroup, discoveryTiles, matchesInstoreSearch } from '../lib/instore-discovery.mjs';

const PAGE_SIZE = 60;
const MAX_PAGE = 10_000;
// This only caches the already-verified read model inside a warm function.
// Checkout still verifies availability independently, while repeat browsing
// avoids re-reading thousands of rows on every search or category click.
const CATALOGUE_CACHE_TTL_MS = 30_000;
const catalogueCache = new Map();

async function getCachedCatalogue(key, loader) {
  const now = Date.now();
  const cached = catalogueCache.get(key);
  if (cached?.value && cached.expiresAt > now) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = loader()
    .then((value) => {
      catalogueCache.set(key, { value, expiresAt: Date.now() + CATALOGUE_CACHE_TTL_MS });
      return value;
    })
    .catch((error) => {
      catalogueCache.delete(key);
      throw error;
    });
  catalogueCache.set(key, { promise, expiresAt: 0 });
  return promise;
}

// Read every page before making an eligibility decision. A partial normal
// catalogue read would make the "not already on main site" rule unsafe.
export async function readCompleteRows(makeQuery, { allowChangingCount = false } = {}) {
  const page = (offset) => makeQuery().order('sku', { ascending: true }).range(offset, offset + 999);
  const first = await page(0);
  if (first.error || !Array.isArray(first.data) || !Number.isInteger(first.count) || first.count < 0 || first.count > 20_000) throw new Error('Catalogue lookup incomplete');
  if (first.count === 0) return [];

  // We know the complete page count after the first request. Parallel page
  // reads keep the preview below the browser's request timeout as the staged
  // catalogue grows, without relaxing production's consistency requirement.
  const pages = Math.ceil(first.count / 1000);
  const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => page((index + 1) * 1000)));
  const responses = [first, ...remaining];
  if (responses.some(({ data, error, count }) => error || !Array.isArray(data) || !Number.isInteger(count) || count < 0 || count > 20_000 || (!allowChangingCount && count !== first.count))) throw new Error('Catalogue lookup incomplete');
  const rows = responses.flatMap(({ data }) => data);
  if (!allowChangingCount && rows.length !== first.count) throw new Error('Catalogue lookup truncated');
  return rows;
}

export function excludeMainCatalogueProducts(products, catalogueRows) {
  return (products || []).filter((product) => {
    const outcome = evaluateInstoreDuplicate(product, {
      status: 'success', complete: true, variantsIncluded: true,
      checkedIdentifiers: [product.sku, product.code, product.barcode], rows: catalogueRows,
    });
    if (outcome.decision === 'hold') throw new Error('Catalogue duplicate review required');
    return outcome.decision === 'eligible';
  });
}

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9 _-]/g, '').slice(0, 80);
}

function normalizePage(value) {
  const page = Number.parseInt(String(value || '1'), 10);
  return Number.isFinite(page) ? Math.max(1, Math.min(MAX_PAGE, page)) : 1;
}

// This is the feed eligibility rule: only reviewed Nutstore images attached to
// an active, priced item with positive currently-synced available stock.
// Zero or unknown stock is excluded; it never turns into an "arriving soon" card.
export function buildExtendedRangeProducts(rows, rawQuery = '', { includeStaged = false, pricesAreInclusive = false } = {}) {
  const query = normalizeQuery(rawQuery);
  const seen = new Set();
  return (rows || []).flatMap((row) => {
    const sku = String(row?.sku || '').trim().toUpperCase();
    const imageUrl = String(row?.image_url || '').trim();
    const availableStock = Number(row?.available_stock);
    const rawPrice = Number(row?.price);
    const price = pricesAreInclusive
      ? (Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0)
      : customerFacingCataloguePrice(row?.price);
    if (!sku || seen.has(sku)
      || !['search_only', ...(includeStaged ? ['hidden'] : [])].includes(row?.visibility_status)
      || row?.image_review_status !== 'verified'
      || (row?.visibility_status === 'hidden'
        ? (!includeStaged || row?.is_active !== false)
        : row?.is_active !== true)
      || !imageUrl.startsWith('https://')
      || !Number.isFinite(availableStock) || availableStock < 1
      || price <= 0) return [];
    const product = {
      id: sku, sku, code: sku, barcode: String(row?.barcode || '').trim(),
      name: String(row?.title || '').trim() || sku,
      title: String(row?.title || '').trim() || sku,
      description: String(row?.original_description || '').trim(),
      originalDescription: String(row?.original_description || '').trim(),
      price, image: imageUrl, images: [imageUrl],
      stockQty: Math.floor(availableStock), stockOnHand: Math.floor(availableStock), inStock: true,
      minQty: 1, category: String(row?.category || '').trim(), categoryLabel: String(row?.category || '').trim(),
      isExtendedRange: true, imageSource: String(row?.image_source || 'nutstore'),
      availability: { state: 'in_stock', label: 'In stock', canOrder: true },
    };
    if (!matchesInstoreSearch(product, query)) return [];
    seen.add(sku);
    return [product];
  });
}

export function stockClient() {
  const url = String(process.env.VITE_STOCK_SUPABASE_URL || '').trim();
  const key = String(process.env.STOCK_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) throw new Error('Instore Products stock source is not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// A preview has its own catalogue run and its own Supabase project.  Keep this
// separate from stockClient(): preview browsing must never silently read the
// production catalogue when a preview setting is missing or misconfigured.
export function previewCatalogueClient() {
  const url = String(process.env.INSTORE_PREVIEW_SUPABASE_URL || '').trim();
  const key = String(process.env.INSTORE_PREVIEW_SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const runId = String(process.env.INSTORE_PREVIEW_RUN_ID || '').trim();
  if (!url || !key || !runId) throw new Error('Isolated Instore preview is not configured');
  return { runId, client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

export function buildPreviewProducts(rows, rawQuery = '') {
  return buildExtendedRangeProducts((rows || []).map((row) => ({
    sku: row.sku,
    barcode: row.barcode,
    title: row.title,
    original_description: row.title,
    // The isolated run stores the already rounded VAT-inclusive customer price.
    price: row.price_incl_vat,
    available_stock: row.available_stock,
    category: row.department,
    image_url: row.image_url,
    image_review_status: 'verified',
    visibility_status: 'search_only',
    is_active: true,
    image_source: 'isolated-preview',
  })), rawQuery, { pricesAreInclusive: true });
}

export function isIsolatedPreviewRequest(req) {
  const host = String(req.headers.host || '').split(':')[0];
  return process.env.VERCEL_ENV === 'preview'
    && process.env.INSTORE_PREVIEW_ENABLED === 'true'
    && /\.vercel\.app$/i.test(host);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const access = await requireApprovedCustomer(req, res);
  if (!access) return;
  try {
    const page = normalizePage(req.query?.page);
    if (isIsolatedPreviewRequest(req)) {
      const { client, runId } = previewCatalogueClient();
      const { data: run, error: runError } = await client.from('preview_instore_runs')
        .select('id, status').eq('id', runId).maybeSingle();
      if (runError || run?.status !== 'ready') throw new Error('Isolated Instore preview is not ready');
      const { data: rows, error } = await client.from('preview_instore_items')
        .select('sku, barcode, title, price_incl_vat, available_stock, department, image_url')
        .eq('run_id', runId)
        .not('image_url', 'is', null)
        .order('sku', { ascending: true });
      if (error || !Array.isArray(rows)) throw new Error('Isolated Instore preview could not be read');
      const allEligible = buildPreviewProducts(rows);
      const query = normalizeQuery(req.query?.q);
      const category = String(req.query?.category || '').trim();
      const includeCatalogue = req.query?.catalogue === '1';
      const filtered = allEligible.filter((product) => matchesInstoreSearch(product, query) && (!category || discoveryGroup(product) === category)).sort((left, right) => compareInstoreSearch(left, right, query));
      const from = (page - 1) * PAGE_SIZE;
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Authorization');
      return res.status(200).json({
        source: 'isolated Instore preview catalogue',
        count: Math.min(PAGE_SIZE, Math.max(0, filtered.length - from)), page, pageSize: PAGE_SIZE,
        total: filtered.length, tiles: discoveryTiles(allEligible), products: filtered.slice(from, from + PAGE_SIZE),
        catalogue: includeCatalogue ? allEligible : undefined,
      });
    }
    const includeStaged = false;
    const client = stockClient();
    // These two complete reads are independent. Fetch them concurrently so a
    // large staged preview cannot spend its whole serverless response window
    // waiting for the main-catalogue duplicate index to begin.
    const allEligible = await getCachedCatalogue(includeStaged ? 'preview' : 'production', async () => {
      const [rangeRows, catalogue] = await Promise.all([
        readCompleteRows(() => client.from('extended_range_items')
          .select('sku, image_source, barcode, title, original_description, price, available_stock, category, image_url, image_review_status, visibility_status, is_active', { count: 'exact' })
          .in('visibility_status', includeStaged ? ['search_only', 'hidden'] : ['search_only'])
          .eq('image_review_status', 'verified')
          .in('is_active', includeStaged ? [true, false] : [true])
          .gt('price', 0)
          .gte('available_stock', 0)
          .like('image_url', 'https://%'), { allowChangingCount: includeStaged }),
        readCompleteRows(() => client.from('website_stock').select('sku, barcode', { count: 'exact' })),
      ]);
      const eligible = buildExtendedRangeProducts(rangeRows, '', { includeStaged });
      return excludeMainCatalogueProducts(eligible, catalogue);
    });
    const query = normalizeQuery(req.query?.q);
    const category = String(req.query?.category || '').trim();
    const includeCatalogue = req.query?.catalogue === '1';
    const filtered = allEligible.filter((product) => matchesInstoreSearch(product, query) && (!category || discoveryGroup(product) === category)).sort((left, right) => compareInstoreSearch(left, right, query));
    const from = (page - 1) * PAGE_SIZE;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    return res.status(200).json({
      source: 'verified Instore image index with live stock eligibility',
      count: Math.min(PAGE_SIZE, Math.max(0, filtered.length - from)), page, pageSize: PAGE_SIZE,
      total: filtered.length, tiles: discoveryTiles(allEligible), products: filtered.slice(from, from + PAGE_SIZE),
      // The first authenticated response includes the same already-verified
      // data used by this handler. The browser can then search and browse it
      // instantly without bypassing the stock, price, image, or duplicate gate.
      catalogue: includeCatalogue ? allEligible : undefined,
    });
  } catch (error) {
    console.error('extended range api error:', error?.message || error);
    return res.status(503).json({ error: 'Instore Products is temporarily unavailable.' });
  }
}
