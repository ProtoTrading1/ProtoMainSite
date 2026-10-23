import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import handler from '../api/extended-range.js';
import { sendInstoreResponse } from '../api/_instore-response.js';

const reply = () => ({
  headers: {}, statusCode: null, body: null, writes: 0,
  setHeader(key, value) { this.headers[key] = value; },
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; this.writes++; return this; },
});

test('a pending cache write cannot delay or alter a completed customer response', async () => {
  const res = reply(), body = { products: [{ sku: '8781830003', price: 9.5, stockQty: 600 }], total: 1 };
  let release, started = 0, scheduled;
  const pending = new Promise(resolve => { release = resolve; });
  assert.equal(sendInstoreResponse(res, body, () => { started++; return pending; }, { schedule(task) { scheduled = task; } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, body);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(res.headers.Vary, 'Authorization');
  await nextTurn();
  assert.equal(started, 1);
  assert.equal(res.writes, 1);
  release(); await scheduled;
  assert.equal(res.body, body);
});

test('cache failure and unavailable lifecycle registration do not retry or replace a successful response', async () => {
  for (const registrationFails of [false, true]) {
    const res = reply(), messages = [];
    let runs = 0, scheduled;
    sendInstoreResponse(res, { products: [], total: 0 }, () => { runs++; throw Error('synthetic cache failure'); }, {
      schedule(task) { scheduled = task; if (registrationFails) throw Error('no lifecycle'); },
      report(message) { messages.push(message); },
    });
    await scheduled;
    assert.equal(res.statusCode, 200);
    assert.equal(res.writes, 1);
    assert.equal(runs, 1);
    assert.equal(messages.length, registrationFails ? 2 : 1);
    assert.ok(messages.every(message => !message.includes('synthetic cache failure')));
  }
});

test('unclaimed maintenance schedules nothing and failed responses start no cache work', () => {
  let scheduled = 0, writes = 0;
  sendInstoreResponse(reply(), { total: 0 }, null, { schedule() { scheduled++; } });
  const broken = { ...reply(), json() { throw Error('connection closed'); } };
  assert.throws(() => sendInstoreResponse(broken, {}, () => { writes++; }, { schedule() { scheduled++; } }), /connection closed/);
  assert.equal(scheduled, 0); assert.equal(writes, 0);
});

test('actual authenticated API returns eligible products before an unresponsive snapshot-stage RPC', async () => {
  const envNames = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'STOCK_SUPABASE_POOLER_URL', 'STOCK_SUPABASE_KEY', 'VERCEL_ENV'];
  const saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const oldFetch = globalThis.fetch;
  const calls = [];
  let releaseStage, notifyStage;
  const stageStarted = new Promise(resolve => { notifyStage = resolve; });
  const heldStage = new Promise(resolve => { releaseStage = resolve; });
  const source = { sku: '8781830003', image_source: 'nutstore', barcode: '8781830003', title: 'TOOTHPICK 3PC', original_description: 'TOOTHPICK 3PC', price: 9.5, available_stock: 600, category: 'Homeware', image_url: 'https://images.example.test/8781830003.jpg', image_review_status: 'verified', visibility_status: 'search_only', is_active: true };
  function json(data, count) {
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json', ...(count === undefined ? {} : { 'content-range': count ? `0-${count - 1}/${count}` : '*/0' }) } });
  }
  try {
    process.env.VITE_SUPABASE_URL = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-auth-only';
    process.env.STOCK_SUPABASE_POOLER_URL = 'https://yiqsvwajozafvalwcero.supabase.co';
    process.env.STOCK_SUPABASE_KEY = 'sb_secret_SYNTHETIC_RECOVERY_FIXTURE_12345';
    process.env.VERCEL_ENV = 'production';
    globalThis.fetch = async (input) => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if (url.pathname === '/auth/v1/user') return json({ id: '00000000-0000-4000-8000-000000000001' });
      if (url.pathname === '/rest/v1/customers') return json([{ id: '00000000-0000-4000-8000-000000000001', role: 'customer', is_approved: true }]);
      if (url.pathname === '/rest/v1/instore_catalogue_state') return json([{ refreshed_at: null, product_count: 0, tiles: [], controls_fingerprint: '' }]);
      if (url.pathname === '/rest/v1/rpc/instore_catalogue_claim_refresh') return json(true);
      if (url.pathname === '/rest/v1/rpc/instore_catalogue_stage') { notifyStage(); await heldStage; return json(1); }
      if (url.pathname === '/rest/v1/rpc/instore_catalogue_commit') return json({ product_count: 1 });
      if (url.pathname === '/rest/v1/extended_range_items') return json([source], 1);
      if (['products', 'website_stock', 'instore_image_controls', 'instore_listing_controls'].some(name => url.pathname === `/rest/v1/${name}`)) return json([], 0);
      throw Error(`Unexpected synthetic request: ${url.pathname}`);
    };
    const res = reply();
    const running = handler({ method: 'GET', headers: { authorization: 'Bearer synthetic-caller' }, query: { q: '8781830003' } }, res);
    await Promise.race([stageStarted, new Promise((_, reject) => setTimeout(() => reject(Error('stage not reached')), 2000))]);
    assert.equal(res.statusCode, 200, 'HTTP result is sent while the optional stage RPC is still pending');
    assert.equal(res.body.total, 1);
    assert.equal(res.body.products[0].sku, source.sku);
    assert.equal(res.body.products[0].price, 9.5);
    assert.equal(res.body.products[0].stockQty, 600);
    assert.equal(res.writes, 1);
    await running;
    releaseStage(); await nextTurn(); await nextTurn();
    assert.equal(calls.filter(path => path.endsWith('/instore_catalogue_stage')).length, 1);
    assert.equal(calls.filter(path => path.endsWith('/instore_catalogue_commit')).length, 1);
  } finally {
    releaseStage(); await nextTurn(); globalThis.fetch = oldFetch;
    for (const name of envNames) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; }
  }
});

test('unauthenticated API request never starts catalogue reads or maintenance', async () => {
  const res = reply(), oldFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = async () => { requests++; throw Error('must not call'); };
    await handler({ method: 'GET', headers: {}, query: { q: '8781830003' } }, res);
    assert.equal(res.statusCode, 401); assert.equal(requests, 0);
  } finally { globalThis.fetch = oldFetch; }
});
