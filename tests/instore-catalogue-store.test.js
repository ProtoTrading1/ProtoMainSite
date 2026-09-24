import test from 'node:test';
import assert from 'node:assert/strict';
import { compareInstoreSearch, discoveryGroup, discoveryTiles, matchesInstoreSearch } from '../lib/instore-discovery.mjs';
import {
  buildCatalogueRows, catalogueSearchPatterns, catalogueSearchTokens, catalogueSnapshotIsFresh,
  catalogueTtlMs, controlsFingerprint, writeCatalogueSnapshot,
} from '../api/_instore-catalogue.js';
import { loadLiveInstoreCatalogue, serveStoredCatalogue } from '../api/extended-range.js';

const PAGE_SIZE = 60;

// A deliberately varied source index: several browse categories, names that
// exercise search ranking, and enough products to page.
const NAMES = [
  'BRACELET WOODEN BEADS', 'BRACELET SILVER BANGLE', 'NECKLACE SILVER CHAIN W PENDANT',
  'SEEDBEAD MIYUKI MIX', 'JUMP RINGS SILVER', 'EARRING HOOKS SILVER',
  'TEDDY BEAR PLUSH LARGE', 'PUZZLE WOODEN ANIMALS', 'BALLOON PACK ASSORTED',
  'HAIR SCRUNCHIE VELVET', 'PURSE PRINTED LEATHER', 'NOTEBOOK A5 LINED',
  'WOOL CRAFT BALL', 'MUG CERAMIC WHITE', 'LIPSTICK MATTE RED',
];
const DEPARTMENTS = [
  'string beads', 'fashion jewellery', 'soft toys', 'toys games', 'party accessories',
  'hair accessories', 'bags wallets', 'stationery art', 'craft parts', 'household', 'cosmetics skin care',
];

function sourceRows(total = 140) {
  return Array.from({ length: total }, (_, index) => ({
    sku: `861${String(810000 + index * 7)}`,
    image_source: 'nutstore',
    barcode: index % 3 === 0 ? `600${String(100000 + index)}` : '',
    title: NAMES[index % NAMES.length],
    original_description: `${NAMES[index % NAMES.length]}${index % 5 === 0 ? ' ASSORTED' : ''}`,
    price: 10 + (index % 17) * 2.5,
    available_stock: 10 + (index % 40),
    category: DEPARTMENTS[index % DEPARTMENTS.length],
    image_url: `https://images.example.test/${index}.jpg`,
    image_review_status: 'verified',
    visibility_status: 'search_only',
    is_active: true,
  }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function project(row, columns) {
  if (!columns || columns === '*') return { ...row };
  const names = columns.split(',').map((name) => name.trim()).filter(Boolean);
  return Object.fromEntries(names.map((name) => [name, row[name]]));
}

// A small stand-in for the parts of PostgREST these routes use, so the stored
// and live paths can be compared over one identical dataset.
function stubStockClient(tables) {
  const data = new Map(Object.entries(tables).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]));
  const rowsOf = (name) => {
    if (!data.has(name)) data.set(name, []);
    return data.get(name);
  };

  function from(table) {
    const filters = [];
    let columns = '*';
    let wantCount = false;
    let orderColumn = null;
    let ascending = true;
    let rangeFrom = null;
    let rangeTo = null;
    let single = false;
    const run = () => {
      const matching = rowsOf(table).filter((row) => filters.every((accept) => accept(row)));
      const count = matching.length;
      const ordered = orderColumn
        ? [...matching].sort((left, right) => {
          const a = left[orderColumn];
          const b = right[orderColumn];
          const compared = typeof a === 'number' && typeof b === 'number'
            ? a - b
            : (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
          return ascending ? compared : -compared;
        })
        : matching;
      const paged = rangeFrom === null ? ordered : ordered.slice(rangeFrom, rangeTo + 1);
      const projected = paged.map((row) => project(row, columns));
      return { data: single ? (projected[0] ?? null) : projected, error: null, count: wantCount ? count : null };
    };
    const api = {
      select(cols, options) { columns = cols; wantCount = options?.count === 'exact'; return api; },
      eq(column, value) { filters.push((row) => row[column] === value); return api; },
      in(column, values) { filters.push((row) => values.includes(row[column])); return api; },
      gt(column, value) { filters.push((row) => Number(row[column]) > value); return api; },
      gte(column, value) { filters.push((row) => Number(row[column]) >= value); return api; },
      like(column, pattern) {
        const expression = new RegExp(`^${pattern.split('%').map(escapeRegExp).join('[\\s\\S]*')}$`);
        filters.push((row) => expression.test(String(row[column] ?? '')));
        return api;
      },
      order(column, options) { orderColumn = column; ascending = options?.ascending !== false; return api; },
      range(start, end) { rangeFrom = start; rangeTo = end; return api; },
      maybeSingle() { single = true; return api; },
      then(resolve, reject) { return Promise.resolve().then(run).then(resolve, reject); },
    };
    return api;
  }

  const state = () => rowsOf('instore_catalogue_state')[0];
  const rpc = async (name, args) => {
    if (name === 'instore_catalogue_claim_refresh') {
      const current = state();
      const staleBefore = Date.parse(args.p_stale_before);
      const refreshedAt = current.refreshed_at ? Date.parse(current.refreshed_at) : null;
      const leaseOpen = current.refreshing_at
        && Date.parse(current.refreshing_at) >= Date.now() - Math.max(args.p_lease_seconds, 30) * 1000;
      if (leaseOpen || (refreshedAt !== null && refreshedAt >= staleBefore)) return { data: false, error: null };
      current.refreshing_at = new Date().toISOString();
      return { data: true, error: null };
    }
    if (name === 'instore_catalogue_release_refresh') {
      state().refreshing_at = null;
      return { data: null, error: null };
    }
    if (name === 'instore_catalogue_stage') {
      const staging = rowsOf('instore_catalogue_staging');
      for (const row of args.p_rows) {
        if (!String(row.sku || '').trim()) continue;
        staging.push({ batch_id: args.p_batch, ...row });
      }
      return { data: staging.length, error: null };
    }
    if (name === 'instore_catalogue_commit') {
      const staged = rowsOf('instore_catalogue_staging').filter((row) => row.batch_id === args.p_batch);
      if (!args.p_expected_count || staged.length !== args.p_expected_count) {
        return { data: null, error: { message: 'staging count mismatch' } };
      }
      data.set('instore_catalogue', staged.map((row) => ({
        sku: row.sku, sort_index: row.sort_index, discovery_group: row.discovery_group,
        search_tokens: row.search_tokens, payload: row.payload, refreshed_at: new Date().toISOString(),
      })));
      data.set('instore_catalogue_staging', []);
      Object.assign(state(), {
        refreshed_at: new Date().toISOString(), refreshing_at: null,
        product_count: staged.length, controls_fingerprint: args.p_controls_fingerprint,
        payload_fingerprint: args.p_payload_fingerprint, tiles: args.p_tiles,
      });
      return { data: state(), error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  };

  return { from, rpc };
}

function emptyState() {
  return [{
    id: true, refreshed_at: null, refreshing_at: null, product_count: 0,
    controls_fingerprint: '', payload_fingerprint: '', tiles: [],
  }];
}

function liveResponse(products, { query = '', category = '', page = 1 } = {}) {
  const filtered = products
    .filter((product) => matchesInstoreSearch(product, query) && (!category || discoveryGroup(product) === category))
    .sort((left, right) => compareInstoreSearch(left, right, query));
  const from = (page - 1) * PAGE_SIZE;
  return {
    count: Math.min(PAGE_SIZE, Math.max(0, filtered.length - from)), page, pageSize: PAGE_SIZE,
    total: filtered.length, tiles: discoveryTiles(products), products: filtered.slice(from, from + PAGE_SIZE),
  };
}

async function seededClient({ imageControls = [], listingControls = [], rows = sourceRows() } = {}) {
  const client = stubStockClient({
    extended_range_items: rows,
    website_stock: [{ sku: 'ALREADY-LISTED', barcode: '6001000000' }],
    instore_image_controls: imageControls,
    instore_listing_controls: listingControls,
    instore_catalogue: [],
    instore_catalogue_staging: [],
    instore_catalogue_state: emptyState(),
  });
  const live = await loadLiveInstoreCatalogue(client, { includeStaged: false });
  await writeCatalogueSnapshot(client, { ...live, tiles: discoveryTiles(live.products) });
  return { client, live };
}

test('the stored Instore collection answers browsing exactly as the live read does', async () => {
  const { client, live } = await seededClient();
  assert.ok(live.products.length > PAGE_SIZE, 'the fixture pages');

  const requests = [
    { query: '', category: '', page: 1 },
    { query: '', category: '', page: 2 },
    { query: '', category: '', page: 3 },
    { query: '', category: 'Bracelets', page: 1 },
    { query: '', category: 'Soft toys', page: 1 },
    { query: '', category: 'Nothing here', page: 1 },
    { query: 'wood bracelet', category: '', page: 1 },
    { query: 'wood', category: '', page: 1 },
    { query: 'silver', category: '', page: 1 },
    { query: 'silver', category: 'Jewellery', page: 1 },
    { query: 'bead', category: '', page: 1 },
    { query: 'mug', category: '', page: 1 },
    { query: 'nosuchproduct', category: '', page: 1 },
    { query: 'bracelet', category: '', page: 2 },
  ];

  for (const request of requests) {
    const from = (request.page - 1) * PAGE_SIZE;
    const stored = await serveStoredCatalogue(client, { ...request, from, includeCatalogue: false });
    assert.ok(stored.body, `the stored collection serves ${JSON.stringify(request)}`);
    const { catalogue, ...body } = stored.body;
    assert.equal(catalogue, undefined);
    assert.deepEqual(body, liveResponse(live.products, request), `identical response for ${JSON.stringify(request)}`);
  }
});

test('the stored ?catalogue=1 payload keeps the whole collection in its live order', async () => {
  const { client, live } = await seededClient();
  const stored = await serveStoredCatalogue(client, { query: '', category: '', page: 1, from: 0, includeCatalogue: true });
  assert.deepEqual(stored.body.catalogue, live.products);
});

test('an Instore image or listing control takes effect before the collection is rebuilt', async () => {
  const { client, live } = await seededClient();
  const hiddenSku = live.products[3].sku;

  // The snapshot was built with no controls, so hiding one must stop it being
  // served rather than showing a product the owner has just removed.
  for (const table of ['instore_listing_controls', 'instore_image_controls']) {
    const changed = await stubbedControls(client, table, [{ sku: hiddenSku, status: 'hidden' }]);
    const stored = await serveStoredCatalogue(changed, { query: '', category: '', page: 1, from: 0 });
    assert.equal(stored.body, null, `${table} invalidates the snapshot`);
    // A superseded snapshot is rebuilt at once instead of being waited out.
    assert.equal(stored.staleBeforeMs, 0);
  }

  // A stored control that hides nothing is not a change, so the fast path stays.
  const visible = await stubbedControls(client, 'instore_listing_controls', [{ sku: hiddenSku, status: 'visible' }]);
  assert.ok((await serveStoredCatalogue(visible, { query: '', category: '', page: 1, from: 0 })).body);
});

// Rebuilds the seeded client with different control rows, keeping the snapshot
// that was committed under the original ones.
async function stubbedControls(client, table, rows) {
  const snapshot = (await client.from('instore_catalogue').select('*')).data;
  const state = (await client.from('instore_catalogue_state').select('*').eq('id', true).maybeSingle()).data;
  return stubStockClient({
    extended_range_items: [], website_stock: [],
    instore_image_controls: table === 'instore_image_controls' ? rows : [],
    instore_listing_controls: table === 'instore_listing_controls' ? rows : [],
    instore_catalogue: snapshot,
    instore_catalogue_staging: [],
    instore_catalogue_state: [{ ...state }],
  });
}

test('a hidden listing is absent from the rebuilt collection', async () => {
  const rows = sourceRows();
  const { live } = await seededClient({ listingControls: [{ sku: rows[5].sku, status: 'hidden' }] });
  assert.equal(live.products.some((product) => product.sku === rows[5].sku), false);
});

test('a stale, empty or differently controlled snapshot is never served', () => {
  const fresh = { refreshed_at: new Date().toISOString(), product_count: 4, controls_fingerprint: 'abc', tiles: [] };
  assert.equal(catalogueSnapshotIsFresh(fresh, 'abc', 150_000), true);
  assert.equal(catalogueSnapshotIsFresh(fresh, 'other', 150_000), false);
  assert.equal(catalogueSnapshotIsFresh(fresh, 'abc', 0), false);
  assert.equal(catalogueSnapshotIsFresh({ ...fresh, product_count: 0 }, 'abc', 150_000), false);
  assert.equal(catalogueSnapshotIsFresh({ ...fresh, tiles: null }, 'abc', 150_000), false);
  assert.equal(catalogueSnapshotIsFresh({ ...fresh, refreshed_at: null }, 'abc', 150_000), false);
  assert.equal(catalogueSnapshotIsFresh(null, 'abc', 150_000), false);
  assert.equal(catalogueSnapshotIsFresh({ ...fresh, refreshed_at: new Date(Date.now() - 200_000).toISOString() }, 'abc', 150_000), false);
  // Database/function clock skew is not a snapshot from the future.
  assert.equal(catalogueSnapshotIsFresh({ ...fresh, refreshed_at: new Date(Date.now() + 5_000).toISOString() }, 'abc', 150_000), true);
});

test('stored search tokens answer the same prefix rule the matcher applies', () => {
  const product = {
    sku: '8618100133', barcode: '6001234567', name: 'BRACELET WOODEN BEADS',
    title: 'BRACELET WOODEN BEADS', originalDescription: 'BRACELET WOODEN BEADS', category: 'string beads',
  };
  const tokens = catalogueSearchTokens(product);
  const matchesStored = (query) => catalogueSearchPatterns(query)
    .every((pattern) => new RegExp(`^${pattern.split('%').join('[\\s\\S]*')}$`).test(tokens));
  for (const query of ['wood', 'wooden', 'bracelet', 'wood bracelet', 'bead', 'beads', '8618100133', '6001234567', 'brace', 'zzz', 'wood zzz']) {
    assert.equal(matchesStored(query), matchesInstoreSearch(product, query), `same outcome for "${query}"`);
  }
});

test('stored rows carry the default customer ordering and the browse category', () => {
  const products = [
    { sku: 'C', name: 'MUG CERAMIC', title: 'MUG CERAMIC', originalDescription: 'MUG CERAMIC', category: 'household' },
    { sku: 'A', name: 'BRACELET BEADS', title: 'BRACELET BEADS', originalDescription: 'BRACELET BEADS', category: 'string beads' },
    { sku: 'B', name: 'SEEDBEAD MIX', title: 'SEEDBEAD MIX', originalDescription: 'SEEDBEAD MIX', category: 'string beads' },
  ];
  const rows = buildCatalogueRows(products);
  // The rows keep the caller's order; sort_index carries the customer order.
  assert.deepEqual(rows.map((row) => row.sku), ['C', 'A', 'B']);
  const expected = [...products].sort((left, right) => compareInstoreSearch(left, right, ''));
  assert.deepEqual(
    [...rows].sort((left, right) => left.sort_index - right.sort_index).map((row) => row.sku),
    expected.map((product) => product.sku),
  );
  for (const row of rows) assert.equal(row.discovery_group, discoveryGroup(row.payload));
});

test('only a hiding control changes the snapshot fingerprint', () => {
  const none = controlsFingerprint(new Map(), new Map());
  assert.equal(controlsFingerprint(new Map([['A', 'visible']]), new Map()), none);
  assert.notEqual(controlsFingerprint(new Map([['A', 'hidden']]), new Map()), none);
  assert.notEqual(controlsFingerprint(new Map(), new Map([['A', 'hidden']])), none);
  // The same hidden SKU on a different control is a different collection.
  assert.notEqual(
    controlsFingerprint(new Map([['A', 'hidden']]), new Map()),
    controlsFingerprint(new Map(), new Map([['A', 'hidden']])),
  );
  assert.equal(
    controlsFingerprint(new Map([['A', 'hidden'], ['B', 'hidden']]), new Map()),
    controlsFingerprint(new Map([['B', 'hidden'], ['A', 'hidden']]), new Map()),
  );
});

test('the served snapshot age is bounded and configurable', () => {
  const original = process.env.INSTORE_CATALOGUE_TTL_MS;
  try {
    delete process.env.INSTORE_CATALOGUE_TTL_MS;
    assert.equal(catalogueTtlMs(), 150_000);
    process.env.INSTORE_CATALOGUE_TTL_MS = '60000';
    assert.equal(catalogueTtlMs(), 60_000);
    process.env.INSTORE_CATALOGUE_TTL_MS = '0';
    assert.equal(catalogueTtlMs(), 0);
    for (const invalid of ['-1', 'soon', '']) {
      process.env.INSTORE_CATALOGUE_TTL_MS = invalid;
      assert.equal(catalogueTtlMs(), 150_000, `${invalid} cannot widen the served age`);
    }
    process.env.INSTORE_CATALOGUE_TTL_MS = '999999999';
    assert.equal(catalogueTtlMs(), 3_600_000);
  } finally {
    if (original === undefined) delete process.env.INSTORE_CATALOGUE_TTL_MS;
    else process.env.INSTORE_CATALOGUE_TTL_MS = original;
  }
});

test('setting the served age to zero restores the live-read-only behaviour', async () => {
  const { client } = await seededClient();
  const original = process.env.INSTORE_CATALOGUE_TTL_MS;
  try {
    process.env.INSTORE_CATALOGUE_TTL_MS = '0';
    const stored = await serveStoredCatalogue(client, { query: '', category: '', page: 1, from: 0 });
    assert.equal(stored.body, null);
  } finally {
    if (original === undefined) delete process.env.INSTORE_CATALOGUE_TTL_MS;
    else process.env.INSTORE_CATALOGUE_TTL_MS = original;
  }
});

test('an empty collection is never published over a working one', async () => {
  const client = stubStockClient({
    instore_catalogue: [], instore_catalogue_staging: [], instore_catalogue_state: emptyState(),
  });
  await assert.rejects(
    () => writeCatalogueSnapshot(client, { products: [], tiles: [], imageControls: new Map(), listingControls: new Map() }),
    /produced no products/,
  );
});
