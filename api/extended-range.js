import { createClient } from '@supabase/supabase-js';
import { requireApprovedCustomer } from './_auth.js';
import { customerFacingCataloguePrice } from '../lib/catalogue-price.mjs';
import { evaluateInstoreDuplicate } from '../lib/instore-duplicate-gate.mjs';
import { discoveryTiles, matchesInstoreSearch } from '../lib/instore-discovery.mjs';
import { instorePage } from '../lib/instore-page.mjs';
import { readCompleteRows } from './_complete-rows.js';
import {
  catalogueSearchPatterns, catalogueSnapshotIsFresh, catalogueTtlMs, claimCatalogueRefresh,
  controlsFingerprint, readCatalogueOrderedPage, readCatalogueProducts,
  readCatalogueSearchCandidates, readCatalogueState, readCatalogueView,
  releaseCatalogueRefresh, writeCatalogueSnapshot,
} from './_instore-catalogue.js';

export { readCompleteRows };

const PAGE_SIZE = 60;
const MAX_PAGE = 10_000;
// Instore is intentionally a high-availability collection. Small residual
// quantities create disappointing customer journeys, so do not show an item
// until there are at least ten units available to sell.
export const MIN_INSTORE_AVAILABLE_STOCK = 10;
const PREVIEW_IMAGE_BUCKET = 'preview-instore-images';
const PREVIEW_IMAGE_URL_TTL_SECONDS = 60 * 60;
// This only caches the already-verified read model inside a warm function.
// Checkout still verifies availability independently, while repeat browsing
// avoids re-reading thousands of rows on every search or category click.
const CATALOGUE_CACHE_TTL_MS = 30_000;
const catalogueCache = new Map();
const SOURCE_LABEL = 'verified Instore image index with live stock eligibility';

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
    // A reviewer can hide a misleading source photo without taking the SKU
    // off sale.  The product keeps its normal availability and checkout
    // identity; the client renders a clear neutral image state instead.
    const imageHidden = row?.image_control_status === 'hidden';
    // Listing controls are an explicit operational removal. Unlike an image
    // control they remove the SKU from discovery and ordering until restored.
    const listingHidden = row?.listing_control_status === 'hidden';
    const imageUrl = imageHidden ? '' : String(row?.image_url || '').trim();
    const availableStock = Number(row?.available_stock);
    const rawPrice = Number(row?.price);
    const price = pricesAreInclusive
      ? (Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0)
      : customerFacingCataloguePrice(row?.price);
    if (!sku || seen.has(sku) || listingHidden
      || !['search_only', ...(includeStaged ? ['hidden'] : [])].includes(row?.visibility_status)
      || row?.image_review_status !== 'verified'
      || (row?.visibility_status === 'hidden'
        ? (!includeStaged || row?.is_active !== false)
        : row?.is_active !== true)
      || (!imageHidden && !imageUrl.startsWith('https://'))
      || !Number.isFinite(availableStock) || availableStock < MIN_INSTORE_AVAILABLE_STOCK
      || price <= 0) return [];
    const product = {
      id: sku, sku, code: sku, barcode: String(row?.barcode || '').trim(),
      name: String(row?.title || '').trim() || sku,
      title: String(row?.title || '').trim() || sku,
      description: String(row?.original_description || '').trim(),
      originalDescription: String(row?.original_description || '').trim(),
      price, image: imageUrl, images: imageUrl ? [imageUrl] : [], imageStatus: imageHidden ? 'hidden' : 'visible',
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

async function readInstoreImageControls(client) {
  const { data, error } = await client
    .from('instore_image_controls')
    .select('sku, status');
  if (error) throw new Error(`Instore image controls unavailable: ${error.message || 'query failed'}`);
  return new Map((data || []).map((row) => [String(row?.sku || '').trim().toUpperCase(), String(row?.status || '').trim()]));
}

async function readInstoreListingControls(client) {
  const { data, error } = await client
    .from('instore_listing_controls')
    .select('sku, status');
  if (error) throw new Error(`Instore listing controls unavailable: ${error.message || 'query failed'}`);
  return new Map((data || []).map((row) => [String(row?.sku || '').trim().toUpperCase(), String(row?.status || '').trim()]));
}

export function applyInstoreImageControls(rows, controls, listingControls = new Map()) {
  return (rows || []).map((row) => ({
    ...row,
    image_control_status: controls?.get(String(row?.sku || '').trim().toUpperCase()) || 'visible',
    listing_control_status: listingControls?.get(String(row?.sku || '').trim().toUpperCase()) || 'visible',
  }));
}

// The complete live read: the Positill-backed source index, the main
// catalogue duplicate index and the Instore controls, resolved into the
// products a customer may see. This is the authoritative build; the stored
// read model below is only ever a copy of its result.
export async function loadLiveInstoreCatalogue(client, { includeStaged = false } = {}) {
  // These two complete reads are independent. Fetch them concurrently so a
  // large staged preview cannot spend its whole serverless response window
  // waiting for the main-catalogue duplicate index to begin.
  const [rangeRows, catalogue, imageControls, listingControls] = await Promise.all([
    readCompleteRows(() => client.from('extended_range_items')
      .select('sku, image_source, barcode, title, original_description, price, available_stock, category, image_url, image_review_status, visibility_status, is_active', { count: 'exact' })
      .in('visibility_status', includeStaged ? ['search_only', 'hidden'] : ['search_only'])
      .eq('image_review_status', 'verified')
      .in('is_active', includeStaged ? [true, false] : [true])
      .gt('price', 0)
      .gte('available_stock', 0)
      .like('image_url', 'https://%'), { allowChangingCount: includeStaged }),
    readCompleteRows(() => client.from('website_stock').select('sku, barcode', { count: 'exact' })),
    readInstoreImageControls(client),
    readInstoreListingControls(client),
  ]);
  const eligible = buildExtendedRangeProducts(applyInstoreImageControls(rangeRows, imageControls, listingControls), '', { includeStaged });
  return { products: excludeMainCatalogueProducts(eligible, catalogue), imageControls, listingControls };
}

export async function storeInstoreCatalogue(client, { products, tiles, imageControls, listingControls }) {
  try {
    await writeCatalogueSnapshot(client, { products, tiles, imageControls, listingControls });
  } catch (error) {
    // A cache that cannot be written must not fail a request that already has
    // the correct products in hand.
    console.error('instore catalogue snapshot not stored:', error?.message || error);
    await releaseCatalogueRefresh(client, error?.message || 'snapshot not stored');
  }
}

// Returns { body } when the stored read model can answer the request
// completely. Otherwise body is null and staleBeforeMs says how old a snapshot
// the live read that follows may leave in place: a snapshot built under
// superseded Instore controls is rebuilt at once rather than waited out.
export async function serveStoredCatalogue(client, { query, category, page, from, includeCatalogue }) {
  const ttlMs = catalogueTtlMs();
  if (ttlMs <= 0) return { body: null, staleBeforeMs: ttlMs };

  // A landing or category page is the whole answer in one database round trip.
  // Anything else — a search, or the full-collection payload — needs the reads
  // below, and so does a database that has not had migration 072 applied.
  if (!catalogueSearchPatterns(query).length && !includeCatalogue) {
    try {
      const view = await readCatalogueView(client, { category, from, pageSize: PAGE_SIZE });
      if (catalogueSnapshotIsFresh(view.state, view.fingerprint, ttlMs)) {
        return {
          body: {
            count: Math.min(PAGE_SIZE, Math.max(0, view.total - from)), page, pageSize: PAGE_SIZE,
            total: view.total, tiles: view.state.tiles, products: view.products, catalogue: undefined,
          },
          staleBeforeMs: ttlMs,
        };
      }
      const supersededByControls = String(view.state.controls_fingerprint || '') !== view.fingerprint;
      return { body: null, staleBeforeMs: supersededByControls ? 0 : ttlMs };
    } catch (error) {
      console.error('instore catalogue view unusable:', error?.message || error);
    }
  }

  let state;
  let fingerprint;
  try {
    // The control tables are tiny and are read on every request, so hiding an
    // Instore image or listing takes effect immediately rather than waiting
    // for the stored collection to be rebuilt.
    const [stateRow, imageControls, listingControls] = await Promise.all([
      readCatalogueState(client),
      readInstoreImageControls(client),
      readInstoreListingControls(client),
    ]);
    state = stateRow;
    fingerprint = controlsFingerprint(imageControls, listingControls);
  } catch (error) {
    console.error('instore catalogue snapshot unreadable:', error?.message || error);
    return { body: null, staleBeforeMs: ttlMs };
  }
  if (!catalogueSnapshotIsFresh(state, fingerprint, ttlMs)) {
    const supersededByControls = String(state?.controls_fingerprint || '') !== fingerprint;
    return { body: null, staleBeforeMs: supersededByControls ? 0 : ttlMs };
  }

  try {
    const [{ products, total }, catalogue] = await Promise.all([
      catalogueSearchPatterns(query).length
        ? readCatalogueSearchCandidates(client, { query, category }).then((candidates) => {
          // The same page definition the live read uses. The database has only
          // narrowed the collection to the stored token matches first.
          const view = instorePage(candidates, { query, category, page, pageSize: PAGE_SIZE });
          return { products: view.products, total: view.total };
        })
        : readCatalogueOrderedPage(client, { category, from, pageSize: PAGE_SIZE }),
      includeCatalogue ? readCatalogueProducts(client) : Promise.resolve(undefined),
    ]);
    return {
      body: {
        count: Math.min(PAGE_SIZE, Math.max(0, total - from)), page, pageSize: PAGE_SIZE,
        total, tiles: state.tiles, products, catalogue,
      },
      staleBeforeMs: ttlMs,
    };
  } catch (error) {
    console.error('instore catalogue snapshot unusable:', error?.message || error);
    return { body: null, staleBeforeMs: ttlMs };
  }
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

// Preview images stay in a private bucket. The browser receives a short-lived
// signed URL only for objects belonging to the configured isolated run.
export async function signPreviewImages(client, runId, rows) {
  const prefix = `runs/${runId}/`;
  const paths = [...new Set((rows || [])
    .map((row) => String(row?.image_object_path || '').trim())
    .filter((objectPath) => objectPath.startsWith(prefix)))];
  if (!paths.length) return [];

  const signed = new Map();
  for (let start = 0; start < paths.length; start += 100) {
    const { data, error } = await client.storage.from(PREVIEW_IMAGE_BUCKET)
      .createSignedUrls(paths.slice(start, start + 100), PREVIEW_IMAGE_URL_TTL_SECONDS);
    if (error) throw new Error('Isolated Instore preview images could not be signed');
    for (const item of data || []) {
      if (item?.path && item?.signedUrl) signed.set(item.path, item.signedUrl);
    }
  }
  return (rows || []).map((row) => ({
    ...row,
    image_url: signed.get(String(row?.image_object_path || '').trim()) || '',
  }));
}

// PostgREST returns at most 1,000 rows unless we explicitly page through the
// result. An Instore preview must not quietly look complete when only its first
// database page was read.
export async function readCompletePreviewRows(client, runId) {
  return readCompleteRows(() => client.from('preview_instore_items')
    .select('sku, barcode, title, price_incl_vat, available_stock, department, image_object_path', { count: 'exact' })
    .eq('run_id', runId)
    .not('image_object_path', 'is', null));
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
      const rows = await readCompletePreviewRows(client, runId);
      // Eligibility and discovery never expose the placeholder; it only lets
      // the existing product mapper validate image-backed rows before we sign
      // the small subset that this response actually displays.
      const allEligible = buildPreviewProducts(rows.map((row) => ({
        ...row,
        image_url: `https://preview.invalid/${encodeURIComponent(row.sku)}`,
      })));
      const query = normalizeQuery(req.query?.q);
      const category = String(req.query?.category || '').trim();
      const filtered = instorePage(allEligible, { query, category, page, pageSize: PAGE_SIZE });
      const from = filtered.from;
      const rowBySku = new Map(rows.map((row) => [String(row.sku || '').trim().toUpperCase(), row]));
      // Tile representatives come from the same positive-stock, priced
      // catalogue as the grid. Each is a current stock image, so it must pass
      // through the same short-lived signed-image path as a product card.
      const tileCandidates = discoveryTiles(allEligible);
      const tileRowsToSign = tileCandidates
        .filter((tile) => !String(tile.image || '').startsWith('/'))
        .map((tile) => rowBySku.get(tile.sku)).filter(Boolean);
      const [signedTiles, signedProducts] = await Promise.all([
        signPreviewImages(client, runId, tileRowsToSign),
        signPreviewImages(client, runId, filtered.products.map((product) => rowBySku.get(product.sku)).filter(Boolean)),
      ]);
      const tileImageBySku = new Map(signedTiles.map((row) => [String(row.sku || '').trim().toUpperCase(), row.image_url]));
      const tiles = tileCandidates.map(({ sku, image, ...tile }) => ({
        ...tile,
        image: tileImageBySku.get(sku) || image || '',
      }));
      const products = buildPreviewProducts(signedProducts);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Authorization');
      return res.status(200).json({
        source: 'isolated Instore preview catalogue',
        count: Math.min(PAGE_SIZE, Math.max(0, filtered.total - from)), page, pageSize: PAGE_SIZE,
        total: filtered.total, tiles, products,
      });
    }
    const includeStaged = false;
    const client = stockClient();
    const query = normalizeQuery(req.query?.q);
    const category = String(req.query?.category || '').trim();
    const includeCatalogue = req.query?.catalogue === '1';
    const from = (page - 1) * PAGE_SIZE;

    // The stored read model answers browsing from one small page instead of
    // rebuilding the whole collection. It is only used while it is fresh and
    // was built under the Instore controls currently in force; otherwise the
    // live read below runs exactly as it always has.
    const stored = await serveStoredCatalogue(client, { query, category, page, from, includeCatalogue });
    if (stored.body) {
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Vary', 'Authorization');
      return res.status(200).json({ source: SOURCE_LABEL, ...stored.body });
    }

    // One caller rebuilds the stored collection; the rest just serve. Claiming
    // before the read means the snapshot is written from source rows that were
    // read now, not from a warm in-process copy of an earlier request's rows.
    const claimed = await claimCatalogueRefresh(client, { staleBeforeMs: stored.staleBeforeMs });
    const live = await (claimed
      ? loadLiveInstoreCatalogue(client, { includeStaged }).catch(async (error) => {
        await releaseCatalogueRefresh(client, error?.message || 'live catalogue read failed');
        throw error;
      })
      : getCachedCatalogue(includeStaged ? 'preview' : 'production', () => loadLiveInstoreCatalogue(client, { includeStaged })));
    const allEligible = live.products;
    const view = instorePage(allEligible, { query, category, page, pageSize: PAGE_SIZE });
    const tiles = discoveryTiles(allEligible);
    if (claimed) await storeInstoreCatalogue(client, { ...live, tiles });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    return res.status(200).json({
      source: SOURCE_LABEL,
      count: Math.min(PAGE_SIZE, Math.max(0, view.total - from)), page, pageSize: PAGE_SIZE,
      total: view.total, tiles, products: view.products,
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
