import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';
import { createClient } from '@supabase/supabase-js';
let sequence = 0;
const session = (id) => ({ user: { id }, access_token: `synthetic-${id}` });
async function fixture(injectedSdk = null) {
  const sdk = injectedSdk || { auth: {} }; const calls = []; let resolve;
  const queryResult = new Promise((done) => { resolve = done; });
  if (!injectedSdk) sdk.from = (table) => { calls.push(['from', table]); return { select(columns) { calls.push(['select', columns]); return this; },
    eq(key, value) { calls.push(['eq', key, value]); return this; }, order() { return this; }, limit(value) { calls.push(['limit', value]); return this; },
    maybeSingle() { calls.push(['single']); return this; }, abortSignal(signal) { calls.push(['signal', signal]); return this; }, then(done, reject) { return queryResult.then(done, reject); } }; };
  globalThis.__historySdk = sdk;
  const authSource = (await readFile(new URL('../src/lib/authHeaders.js', import.meta.url), 'utf8'))
    .replace("import { supabase } from './supabase';", 'const supabase = globalThis.__historySdk;');
  const auth = await import(`data:text/javascript;base64,${Buffer.from(authSource + `\n//auth ${sequence++}`).toString('base64')}`);
  globalThis.__historyAuth = auth;
  const deadlineSource = await readFile(new URL('../src/lib/requestDeadline.mjs', import.meta.url), 'utf8');
  globalThis.__historyDeadline = await import(`data:text/javascript;base64,${Buffer.from(deadlineSource).toString('base64')}`);
  const source = (await readFile(new URL('../src/lib/orders.js', import.meta.url), 'utf8'))
    .replace("import { supabase } from './supabase';", 'const supabase = globalThis.__historySdk;')
    .replace("import { captureAuthIdentity, assertAuthIdentity } from './authHeaders';", 'const { captureAuthIdentity, assertAuthIdentity } = globalThis.__historyAuth;')
    .replace("import { withDeadline } from './requestDeadline.mjs';", 'const { withDeadline } = globalThis.__historyDeadline;');
  const orders = await import(`data:text/javascript;base64,${Buffer.from(source + `\n//orders ${sequence++}`).toString('base64')}`);
  auth.rememberAuthSession(session('A'));
  return { orders, auth, sdk, calls, resolve };
}
const row = () => ({ id: 'ORDER1', customer_id: 'A', order_number: 'TEST001', created_at: '2026-10-05', status: 'pending',
  items: [{ code: 'SKU1', name: 'Synthetic item', qty: 2, unitPrice: 10, isExtendedRange: true, preference: 'Blue' }], total_ex_vat: 20,
  discount_amount: 2, discount_pct: 10, promo_code: 'TEST', delivery_method: 'In store pick up', customer_notes: 'Synthetic reference',
  client_ref: 'private-reference', checkout_request_hash: 'private-hash', checkout_notification_snapshot: { recipients: ['private-provider-recipient'] } });
test('actual history reader selects explicit presentation fields, filters owner and strips extra returned evidence', async () => {
  const f = await fixture(); const pending = f.orders.fetchOrderHistory('A'); f.resolve({ data: [row()] }); const rows = await pending;
  assert(f.calls.some((c) => c[0] === 'eq' && c[1] === 'customer_id' && c[2] === 'A'));
  assert.equal(f.calls.find((c) => c[0] === 'select')[1], f.orders.CUSTOMER_ORDER_COLUMNS.join(','));
  for (const key of ['client_ref', 'checkout_request_hash', 'checkout_notification_snapshot']) assert.equal(Object.hasOwn(rows[0], key), false);
  assert.deepEqual(rows[0].items, row().items); assert.equal(rows[0].discount_amount, 2); assert.equal(rows[0].delivery_method, 'In store pick up');
});
for (const kind of ['B', 'logout', 'ABA']) test(`late history result is rejected after ${kind}`, async () => {
  const f = await fixture(); const pending = f.orders.fetchOrderHistory('A');
  f.auth.rememberAuthSession(kind === 'logout' ? null : session('B')); if (kind === 'ABA') f.auth.rememberAuthSession(session('A'));
  f.resolve({ data: [row()] }); await assert.rejects(pending, { code: 'AUTH_ACCOUNT_CHANGED' });
});
test('last-order reader uses same owner fence and minimal columns', async () => {
  const f = await fixture(); const pending = f.orders.fetchLastOrder('A'); f.resolve({ data: row() }); const result = await pending;
  assert.equal(result.order_number, 'TEST001'); assert.equal(result.checkout_notification_snapshot, undefined);
  assert(f.calls.some((c) => c[0] === 'single')); assert(f.calls.some((c) => c[0] === 'limit' && c[1] === 1));
});
for (const single of [false, true]) test(`foreign returned row holds ${single ? 'last order' : 'history'}`, async () => {
  const f = await fixture(); const pending = single ? f.orders.fetchLastOrder('A') : f.orders.fetchOrderHistory('A');
  const foreign = { ...row(), customer_id: 'B' }; f.resolve({ data: single ? foreign : [foreign] });
  await assert.rejects(pending, { code: 'AUTH_ACCOUNT_CHANGED' });
});
test('requesting another account fails before SDK access', async () => {
  const f = await fixture(); await assert.rejects(f.orders.fetchOrderHistory('B'), { code: 'AUTH_ACCOUNT_CHANGED' }); assert.deepEqual(f.calls, []);
});
test('same-account token refresh keeps a legitimate history read', async () => {
  const f = await fixture(); const pending = f.orders.fetchOrderHistory('A'); f.auth.rememberAuthSession({ ...session('A'), access_token: 'replacement' });
  f.resolve({ data: [row()] }); assert.equal((await pending).length, 1);
});
test('profile cancelled scope cannot publish a late result', async () => {
  const f = await fixture(); const published = []; const scope = f.orders.createOrderHistoryReadScope('A', (state) => published.push(state));
  await Promise.resolve(); scope.cancel(); f.resolve({ data: [row()] }); await scope.done; assert(published.every((state) => state.state === 'loading'));
});
test('profile current render suppresses prior account and prior A epoch immediately', async () => {
  const f = await fixture(); const identity = f.auth.captureAuthIdentity(); const state = { customerId: 'A', identity, state: 'loaded', rows: [row()] };
  assert.equal(f.orders.visibleOrderHistory(state, 'A').length, 1);
  f.auth.rememberAuthSession(session('B')); assert.deepEqual(f.orders.visibleOrderHistory(state, 'B'), []);
  f.auth.rememberAuthSession(session('A')); assert.deepEqual(f.orders.visibleOrderHistory(state, 'A'), []);
});
test('profile scope with account switch or failed read never publishes private rows', async () => {
  for (const kind of ['switch', 'error']) {
    const f = await fixture(); const published = []; const scope = f.orders.createOrderHistoryReadScope('A', (state) => published.push(state));
    await Promise.resolve(); if (kind === 'switch') f.auth.rememberAuthSession(session('B'));
    f.resolve(kind === 'error' ? { error: new Error('Synthetic SDK read failed') } : { data: [row()] });
    await scope.done; assert(published.every((state) => state.state === 'loading' || (kind === 'error' && state.state === 'error')));
    assert.equal(published.some((state) => state.state === 'loaded'), false);
    if (kind === 'error') assert.equal(published.at(-1).state, 'error');
  }
});

test('installed Supabase SDK serializes minimal own-account query with inert transport', async () => {
  const urls = [];
  const sdk = createClient('https://order-history.invalid', 'synthetic-nonsecret-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input)); assert.equal(url.origin, 'https://order-history.invalid'); urls.push(url);
      return new Response(JSON.stringify([row()]), { status: 200, headers: { 'content-type': 'application/json' } });
    } },
  });
  const f = await fixture(sdk); const result = await f.orders.fetchOrderHistory('A', 10);
  assert.equal(urls.length, 1); assert.equal(urls[0].pathname, '/rest/v1/orders');
  assert.equal(urls[0].searchParams.get('customer_id'), 'eq.A');
  assert.equal(urls[0].searchParams.get('select'), f.orders.CUSTOMER_ORDER_COLUMNS.join(','));
  assert.equal(result[0].checkout_notification_snapshot, undefined);
});

test('only confirmed successful empty history produces loaded empty state', async () => {
  const f = await fixture(); const published = [];
  assert.equal(f.orders.visibleOrderHistoryState(null, 'A').state, 'loading');
  const scope = f.orders.createOrderHistoryReadScope('A', (state) => published.push(state));
  await Promise.resolve(); assert.equal(published.at(-1).state, 'loading');
  f.resolve({ data: [] }); await scope.done;
  assert.equal(published.at(-1).state, 'loaded'); assert.deepEqual(published.at(-1).rows, []);
});
test('late A read error cannot set B error or false empty state', async () => {
  const f = await fixture(); const published = [];
  const scope = f.orders.createOrderHistoryReadScope('A', (state) => published.push(state));
  await Promise.resolve(); f.auth.rememberAuthSession(session('B')); f.resolve({ error: new Error('private SDK detail') }); await scope.done;
  assert(published.every((state) => state.state === 'loading'));
  assert.equal(f.orders.visibleOrderHistoryState(published[0], 'B').state, 'loading');
});

test('actual MyOrders component renders distinct loading, read error/retry and confirmed empty states', async () => {
  const presentationSource = await readFile(new URL('../src/lib/orderPresentation.js', import.meta.url), 'utf8');
  globalThis.__historyPresentation = await import(`data:text/javascript;base64,${Buffer.from(presentationSource).toString('base64')}`);
  globalThis.__historyReact = React; globalThis.__historyRuntime = jsxRuntime; globalThis.__historyIcons = icons;
  const source = (await readFile(new URL('../src/components/MyOrdersCentre.jsx', import.meta.url), 'utf8'))
    .replace("import { ChevronDown, ChevronUp, Package, RotateCcw, Truck } from 'lucide-react';", 'const { ChevronDown, ChevronUp, Package, RotateCcw, Truck } = globalThis.__historyIcons;')
    .replace("import { useState } from 'react';", 'const { useState } = globalThis.__historyReact;')
    .replace("import { customerOrderStatus, customerOrderTimeline, orderVatSummary } from '../lib/orderPresentation';", 'const { customerOrderStatus, customerOrderTimeline, orderVatSummary } = globalThis.__historyPresentation;');
  const compiled = (await transformWithOxc(source, 'MyOrdersCentre.jsx', { jsx: { runtime: 'automatic' } })).code
    .replace(/import\s*{([^}]+)}\s*from\s*["']react\/jsx-runtime["'];/g, (_match, entries) => `const { ${entries.replace(/ as /g, ': ')} } = globalThis.__historyRuntime;`);
  const { default: MyOrders } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const loading = renderToStaticMarkup(React.createElement(MyOrders, { orders: [], loading: true }));
  assert.match(loading, /Loading your orders/); assert.doesNotMatch(loading, /No orders placed yet/);
  const error = renderToStaticMarkup(React.createElement(MyOrders, { orders: [], error: 'Your orders could not be loaded. Check your connection and try again.', onRetry: () => {} }));
  assert.match(error, /role="alert"/); assert.match(error, /Retry order history/); assert.doesNotMatch(error, /No orders placed yet/);
  const empty = renderToStaticMarkup(React.createElement(MyOrders, { orders: [] })); assert.match(empty, /No orders placed yet/);
  const populated = renderToStaticMarkup(React.createElement(MyOrders, { orders: [row()], onReorderOrder: () => {} }));
  assert.match(populated, /TEST001/); assert.match(populated, /R18.00/); assert.doesNotMatch(populated, /private-provider-recipient/);
});

test('explicit history retry performs a new read-only scope and recovers verified empty history', async () => {
  const f = await fixture(); let reads = 0; const published = [];
  const readHistory = async (customerId, limit) => {
    assert.equal(customerId, 'A'); assert.equal(limit, 10); reads += 1;
    if (reads === 1) throw new Error('private transport details');
    return [];
  };
  const first = f.orders.createOrderHistoryReadScope('A', (state) => published.push(state), { readHistory });
  await first.done; assert.equal(published.at(-1).state, 'error');
  assert(!published.at(-1).error.includes('private transport details'));
  first.cancel();
  const retry = f.orders.createOrderHistoryReadScope('A', (state) => published.push(state), { readHistory });
  await retry.done; assert.equal(reads, 2); assert.equal(published.at(-1).state, 'loaded');
  assert.deepEqual(published.at(-1).rows, []);
});

test('installed SDK stalled history aborts at deadline and late reply cannot replace error state', async () => {
  let resolveResponse; let signal; let calls = 0;
  const sdk = createClient('https://order-history.invalid', 'synthetic-nonsecret-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_url, options) => { calls += 1; signal = options.signal; return new Promise((resolve) => { resolveResponse = resolve; }); } },
  });
  const f = await fixture(sdk); const reader = f.orders.createCustomerOrderReader({ client: sdk, timeoutMs: 30 });
  const published = []; const scope = f.orders.createOrderHistoryReadScope('A', (state) => published.push(state), { readHistory: reader.fetchOrderHistory });
  await scope.done; assert.equal(signal.aborted, true); assert.equal(calls, 1); assert.equal(published.at(-1).state, 'error');
  resolveResponse(new Response(JSON.stringify([row()]), { status: 200, headers: { 'content-type': 'application/json' } }));
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(published.at(-1).state, 'error');
  assert.equal(published.some((state) => state.state === 'loaded'), false);
});
for (const status of [401, 503]) test(`installed SDK ${status} error/retry is bounded by history deadline`, async () => {
  let calls = 0; let signal;
  const sdk = createClient('https://order-history.invalid', 'synthetic-nonsecret-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_url, options) => { calls += 1; signal = options.signal; return new Response(JSON.stringify({ message: 'Synthetic unavailable' }), { status, headers: { 'content-type': 'application/json' } }); } },
  });
  const f = await fixture(sdk); const reader = f.orders.createCustomerOrderReader({ client: sdk, timeoutMs: 30 });
  await assert.rejects(reader.fetchOrderHistory('A')); assert.equal(signal.aborted, true);
  assert.equal(calls, 1); // 503 retry backoff is aborted; 401 is not retried.
});
