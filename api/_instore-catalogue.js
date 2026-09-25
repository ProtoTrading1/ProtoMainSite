import { createHash, randomUUID } from 'node:crypto';
import { compareInstoreSearch, discoveryGroup, instoreSearchTokens, searchTerms } from '../lib/instore-discovery.mjs';
import { readCompleteRows } from './_complete-rows.js';

// The stored Instore read model (migration 070, stock project). It holds the
// products that already passed the image, price, stock and duplicate gates, so
// a customer request reads one page instead of rebuilding the whole collection
// from the Positill-backed source index. It is a cache of that decision: it is
// only served while it is fresh and was built under the Instore image and
// listing controls currently in force, and checkout still verifies every line
// against the live index and the stock bridge.
const DEFAULT_CATALOGUE_TTL_MS = 150_000;
const MAX_CATALOGUE_TTL_MS = 3_600_000;
const REFRESH_LEASE_SECONDS = 180;
const STAGE_CHUNK_SIZE = 1000;

export function catalogueTtlMs() {
  const raw = String(process.env.INSTORE_CATALOGUE_TTL_MS ?? '').trim();
  if (!raw) return DEFAULT_CATALOGUE_TTL_MS;
  const parsed = Number.parseInt(raw, 10);
  // A misconfigured value must not quietly widen how old a served collection
  // may be; only an explicit, in-range setting is honoured.
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_CATALOGUE_TTL_MS;
  return Math.min(parsed, MAX_CATALOGUE_TTL_MS);
}

function hidden(controls) {
  return [...(controls instanceof Map ? controls : new Map())]
    .filter(([, status]) => String(status || '').trim() === 'hidden')
    .map(([sku]) => String(sku || '').trim().toUpperCase())
    .sort();
}

// Only a hiding control changes what a customer sees, so only those form the
// fingerprint: a stored 'visible' row must not force a needless rebuild.
export function controlsFingerprint(imageControls, listingControls) {
  return createHash('sha256')
    .update(JSON.stringify({ image: hidden(imageControls), listing: hidden(listingControls) }))
    .digest('hex');
}

export function rowsFingerprint(rows) {
  const digest = createHash('sha256');
  for (const row of rows || []) {
    digest.update(`${row.sku}\u0000${row.sort_index}\u0000${row.discovery_group}\u0000${row.search_tokens}\u0000${JSON.stringify(row.payload)}\u0001`);
  }
  return digest.digest('hex');
}

// Space-padded so a stored token list can answer the matcher's prefix rule:
// token.startsWith(term) is ' bracelet wooden ' LIKE '% wood%'.
export function catalogueSearchTokens(product) {
  return ` ${[...new Set(instoreSearchTokens(product))].join(' ')} `;
}

// Safe by construction: a search term is normalised to [a-z0-9] words, so it
// can never carry a LIKE wildcard or escape character.
export function catalogueSearchPatterns(query) {
  return [...new Set(searchTerms(query))].map((term) => `% ${term}%`);
}

// sort_index is the default (no search term) customer ordering, so the
// database can order and page the landing and category views itself. The rows
// themselves stay in the caller's order, which is the SKU order the live read
// produces and the order the ?catalogue=1 payload has always used.
export function buildCatalogueRows(products) {
  const ordered = [...(products || [])].sort((left, right) => compareInstoreSearch(left, right, ''));
  const sortIndexBySku = new Map(ordered.map((product, index) => [product.sku, index]));
  return (products || []).map((product) => ({
    sku: product.sku,
    sort_index: sortIndexBySku.get(product.sku),
    discovery_group: discoveryGroup(product),
    search_tokens: catalogueSearchTokens(product),
    payload: product,
  }));
}

export function catalogueSnapshotIsFresh(state, fingerprint, ttlMs, now = Date.now()) {
  if (ttlMs <= 0 || !state || !state.refreshed_at || !Array.isArray(state.tiles)) return false;
  if (!Number.isInteger(state.product_count) || state.product_count <= 0) return false;
  if (String(state.controls_fingerprint || '') !== fingerprint) return false;
  const age = now - Date.parse(state.refreshed_at);
  // A negative age is database/function clock skew, not a future snapshot.
  return Number.isFinite(age) && age <= ttlMs;
}

export async function readCatalogueState(client) {
  const { data, error } = await client
    .from('instore_catalogue_state')
    .select('refreshed_at, refreshing_at, product_count, controls_fingerprint, payload_fingerprint, tiles')
    .eq('id', true)
    .maybeSingle();
  if (error) throw new Error(`Instore catalogue state unavailable: ${error.message || 'query failed'}`);
  return data || null;
}

function hiddenControlMap(skus) {
  return new Map((Array.isArray(skus) ? skus : [])
    .map((sku) => [String(sku || '').trim().toUpperCase(), 'hidden']));
}

/**
 * The whole answer for a landing or category page in one database round trip:
 * the snapshot's freshness and tiles, the current hidden controls, the total,
 * and the page of products. The caller still compares the controls against the
 * fingerprint the snapshot was built under, exactly as it does when it reads
 * the control tables itself, so a superseded snapshot is still refused.
 */
export async function readCatalogueView(client, { category = '', from = 0, pageSize = 60 } = {}) {
  const { data, error } = await client.rpc('instore_catalogue_view', {
    p_category: category, p_from: from, p_limit: pageSize,
  });
  if (error) throw new Error(`Instore catalogue view unavailable: ${error.message || 'rpc failed'}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Instore catalogue view was empty');
  const total = Number(data.total);
  if (!Number.isInteger(total) || total < 0) throw new Error('Instore catalogue view returned no total');
  return {
    state: {
      refreshed_at: data.refreshed_at,
      product_count: Number(data.product_count),
      controls_fingerprint: String(data.controls_fingerprint || ''),
      tiles: Array.isArray(data.tiles) ? data.tiles : null,
    },
    fingerprint: controlsFingerprint(
      hiddenControlMap(data.hidden_image_skus),
      hiddenControlMap(data.hidden_listing_skus),
    ),
    total,
    products: Array.isArray(data.products) ? data.products : [],
  };
}

// The landing page and a category view are the stored order, so the database
// applies the paging and the count.
export async function readCatalogueOrderedPage(client, { category = '', from = 0, pageSize = 60 } = {}) {
  let request = client.from('instore_catalogue').select('payload', { count: 'exact' });
  if (category) request = request.eq('discovery_group', category);
  const { data, error, count } = await request
    .order('sort_index', { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`Instore catalogue page unavailable: ${error.message || 'query failed'}`);
  if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error('Instore catalogue page was incomplete');
  return { products: data.map((row) => row.payload), total: count };
}

// A search keeps its ranking in the application, so the wording of a result
// list never changes. The database only narrows the collection to the stored
// token matches first, in SKU order, which is the order the live read produced
// and therefore the order equal-scoring products have always tied in.
export async function readCatalogueSearchCandidates(client, { query, category = '' } = {}) {
  const patterns = catalogueSearchPatterns(query);
  const rows = await readCompleteRows(() => {
    let request = client.from('instore_catalogue').select('sku, payload', { count: 'exact' });
    if (category) request = request.eq('discovery_group', category);
    for (const pattern of patterns) request = request.like('search_tokens', pattern);
    return request;
  });
  return rows.map((row) => row.payload);
}

export async function readCatalogueProducts(client) {
  const rows = await readCompleteRows(() => client.from('instore_catalogue').select('sku, payload', { count: 'exact' }));
  return rows.map((row) => row.payload);
}

export async function claimCatalogueRefresh(client, { staleBeforeMs = 0 } = {}) {
  const { data, error } = await client.rpc('instore_catalogue_claim_refresh', {
    p_stale_before: new Date(Date.now() - Math.max(0, staleBeforeMs)).toISOString(),
    p_lease_seconds: REFRESH_LEASE_SECONDS,
  });
  // Snapshot bookkeeping must never decide whether a customer sees products.
  if (error) {
    console.error('instore catalogue claim failed:', error.message || error);
    return false;
  }
  return data === true;
}

export async function releaseCatalogueRefresh(client, message) {
  const { error } = await client.rpc('instore_catalogue_release_refresh', {
    p_error: String(message || '').slice(0, 500) || null,
  });
  if (error) console.error('instore catalogue release failed:', error.message || error);
}

export async function writeCatalogueSnapshot(client, { products, tiles, imageControls, listingControls }) {
  const rows = buildCatalogueRows(products);
  if (!rows.length) throw new Error('Instore catalogue refresh produced no products');
  const batch = randomUUID();
  for (let start = 0; start < rows.length; start += STAGE_CHUNK_SIZE) {
    const { error } = await client.rpc('instore_catalogue_stage', {
      p_batch: batch,
      p_rows: rows.slice(start, start + STAGE_CHUNK_SIZE),
    });
    if (error) throw new Error(`Instore catalogue staging failed: ${error.message || 'staging rejected'}`);
  }
  const { data, error } = await client.rpc('instore_catalogue_commit', {
    p_batch: batch,
    p_tiles: tiles || [],
    p_controls_fingerprint: controlsFingerprint(imageControls, listingControls),
    p_payload_fingerprint: rowsFingerprint(rows),
    p_expected_count: rows.length,
  });
  if (error) throw new Error(`Instore catalogue commit failed: ${error.message || 'commit rejected'}`);
  return { productCount: rows.length, state: data };
}
