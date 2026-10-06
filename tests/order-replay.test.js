import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createSendOrderHandler, resolveAuthoritativePrices } from '../api/send-order.js';
import { checkoutRequestHash } from '../api/_order-replay.js';

const user = { id: '10000000-0000-4000-8000-000000000001', email: 'buyer@example.invalid' };
const body = () => ({ clientRef: randomUUID(), deliveryMethod: 'In store pick up', customerNotes: 'Deliver carefully', items: [{ qty: 2, preference: 'Blue', product: { id: 'SKU-1', sku: 'SKU-1', code: '1001', name: 'Forged title', price: 99999, checkoutSnapshot: { unitPrice: 10, stockQty: 100 } } }] });
const authoritative = (items) => items.map(item => ({ qty: item.qty, preference: item.preference, product: { id: 'SKU-1', sku: 'SKU-1', code: '1001', name: 'Verified notebook', price: 10, unitsOfIssue: 'EACH' } }));

function fixture(options = {}) {
  const orders = []; const jobs = new Map(); const calls = { prices: 0, team: [], ack: [], pdf: 0, fallback: [], profile: 0, patches: 0, lookups: 0 };
  class Query {
    constructor(table) { this.table = table; this.filters = []; }
    select() { return this; }
    eq(key, value) { this.filters.push([key, value]); return this; }
    insert(rows) { this.insertRows = rows; return this; }
    update(patch) { this.patch = patch; return this; }
    maybeSingle() { return this.execute(); }
    single() { return this.execute(); }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
    async execute() {
      if (this.table === 'orders') {
        if (this.insertRows) {
          const input = this.insertRows[0];
          if (orders.some(order => order.client_ref === input.client_ref)) return { error: { code: '23505', message: 'unique reference' } };
          const row = { id: randomUUID(), order_number: `TEST-${orders.length + 1}`, created_at: '2026-10-03T08:00:00Z', ...structuredClone(input) };
          orders.push(row); options.onCaptured?.(row); return { data: structuredClone(row) };
        }
        if (this.patch) calls.patches++;
        if (!this.patch) {
          calls.lookups++;
          if (options.lookupFailureAt === calls.lookups) return { error: { message: 'Synthetic lookup unavailable' } };
        }
        return { data: structuredClone(orders.find(row => this.filters.every(([key, value]) => row[key] === value)) || null) };
      }
      if (this.table === 'customers') {
        calls.profile++;
        return { data: { id: user.id, name: 'Verified Buyer', business_name: 'Verified Business', customer_code: 'C001', delivery_address: 'Synthetic address', tier: 'regular' } };
      }
      if (this.table === 'proto_active_customers') return { data: null };
      throw new Error(`Unexpected table ${this.table}`);
    }
  }
  const portal = {
    from: table => new Query(table),
    async rpc(name, args = {}) {
      if (name === 'order_delivery_schema_readiness') return { data: { contractVersion: 1, ready: true } };
      if (name === 'order_replay_schema_readiness') return options.missingSchema ? { error: { message: 'missing migration' } } : { data: { contractVersion: 1, ready: true } };
      const key = `${args.p_order_id}:${args.p_channel}`;
      if (name === 'claim_storefront_order_delivery') {
        if (options.claimUnavailable) return { error: { message: 'unavailable' } };
        let job = jobs.get(key);
        if (!job) { job = { status: 'pending', providerKey: randomUUID(), attempts: 0 }; jobs.set(key, job); }
        if (job.status === 'succeeded') return { data: { claimed: false, result: structuredClone(job.result) } };
        if (job.status === 'processing') return { data: { claimed: false, reason: 'Already processing' } };
        job.status = 'processing'; job.worker = args.p_worker; job.attempts++;
        return { data: { claimed: true, providerKey: job.providerKey } };
      }
      if (name === 'finish_storefront_order_delivery') {
        const job = jobs.get(key);
        if (options.finishUnavailable?.(args)) return { error: { message: 'ack unavailable' } };
        if (job.worker !== args.p_worker || job.status !== 'processing') return { data: false };
        job.status = args.p_succeeded ? 'succeeded' : 'retry'; job.result = structuredClone(args.p_result); return { data: true };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  const handler = createSendOrderHandler({
    requireApprovedCustomer: async (req, res) => {
      if (options.denied) { res.status(403).json({ error: 'Approved trade account required' }); return null; }
      return { user };
    },
    getPortalAdminClient: () => portal,
    resolveAuthoritativePrices: async items => { calls.prices++; return options.resolve ? options.resolve(items, calls.prices) : authoritative(items); },
    resolveOrderNotifyRecipients: () => ['team@example.invalid'],
    prepareItems: async items => items,
    buildPdfBuffer: async () => { if (options.polishedPdfFail) throw new Error('Synthetic renderer failure'); return Buffer.from('synthetic PDF'); },
    buildOrderPdfBuffer: async payload => { calls.fallback.push(structuredClone(payload)); return Buffer.from('fallback PDF'); },
    sendTeamEmailWithRetry: async payload => { calls.team.push(structuredClone(payload)); await options.beforeTeam?.(); return options.teamFail ? { ok: false, error: 'Provider failed', attemptCount: 1 } : { ok: true, messageId: 'team-message', attemptCount: 1 }; },
    sendCustomerOrderAck: async payload => { calls.ack.push(structuredClone(payload)); return options.ackFail ? { sent: false, error: 'Customer email failed' } : { sent: true, messageId: 'customer-message', recipient: payload.toEmail }; },
    runOrderTeamNotify: async (id, info) => { calls.pdf++; return { ok: info.emailSent, pdfStored: true, orderId: id, statusAdvanced: info.emailSent }; },
    readOrderNotifyLog: async () => null,
    saveOrderNotifyLog: async () => {},
    validatePromoCode: async (_code, subtotal) => ({ valid: true, code: 'PROTO75', discountPct: 7.5, discountAmount: subtotal * .075 }),
    isCustomerEligibleForPromo: async () => true,
    hasCustomerUsedPromo: async () => options.promoUsed?.(orders) || false,
    claimPromoRedemption: async () => 'promo-id',
    finalisePromoRedemption: async () => {},
    releasePromoRedemption: async () => {},
  });
  const invoke = async input => {
    const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } };
    const previousKey = process.env.BREVO_API_KEY; const previousEnv = process.env.VERCEL_ENV;
    process.env.BREVO_API_KEY = 'synthetic-only'; process.env.VERCEL_ENV = options.preview ? 'preview' : 'development';
    try { await handler({ method: 'POST', headers: {}, body: structuredClone(input) }, response); }
    finally { if (previousKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = previousKey; if (previousEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previousEnv; }
    return response;
  };
  return { invoke, calls, orders, jobs, options };
}

test('handler replays the original saved result before fresh price, stock or promo checks', async () => {
  const f = fixture(); const input = body(); input.promoCode = 'PROTO75';
  const first = await f.invoke(input); assert.equal(first.statusCode, 200);
  f.options.resolve = () => { throw new Error('Stock changed after capture'); };
  const replay = await f.invoke(input);
  assert.equal(replay.statusCode, 200); assert.deepEqual(replay.body, first.body);
  assert.equal(f.calls.prices, 1); assert.equal(f.orders.length, 1);
  assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1); assert.equal(f.calls.pdf, 1);
  assert.equal(f.calls.patches, 0); assert.equal(f.orders[0].items[0].unitPrice, 10);
  assert.match(f.calls.team[0].htmlContent, /Verified notebook/);
  assert.doesNotMatch(f.calls.team[0].htmlContent, /Forged title|99999/);
});

test('explicit unavailable rejection permits same-reference amended capture and exactly one order/delivery', async () => {
  const f = fixture({ resolve: () => { throw Object.assign(new Error('Product on order line 4 is unavailable.'),
    { status: 400, code: 'ORDER_PRODUCT_UNAVAILABLE' }); } });
  const input = body();
  input.items = Array.from({ length: 11 }, (_, index) => ({ ...input.items[0], product: {
    ...input.items[0].product, id: `SYNTHETIC-${index}`, sku: `SYNTHETIC-${index}`,
  } }));
  const rejected = await f.invoke(input);
  assert.equal(rejected.statusCode, 400); assert.equal(rejected.body.rejectedBeforeCapture, true);
  assert.equal(f.orders.length, 0); assert.equal(f.calls.team.length, 0);
  f.options.resolve = authoritative;
  const amended = structuredClone(input); amended.items = amended.items.slice(0, 8);
  assert.equal((await f.invoke(amended)).statusCode, 200);
  assert.equal((await f.invoke(amended)).statusCode, 200);
  assert.equal(f.orders.length, 1); assert.equal(f.orders[0].items.length, 8);
  assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1);
  const stale = await f.invoke(input);
  assert.equal(stale.statusCode, 409); assert.equal(stale.body.code, 'ORDER_REFERENCE_CONFLICT');
  assert.equal(stale.body.rejectedBeforeCapture, undefined);
  assert.equal(f.orders.length, 1);
});

test('same reference with changed quantity, delivery, notes, preference or submitted price conflicts without mail or order mutation', async () => {
  const f = fixture(); const input = body(); await f.invoke(input);
  const original = structuredClone(f.orders);
  const variants = [
    value => value.items[0].qty++, value => value.deliveryMethod = "Customer's own courier",
    value => value.customerNotes += ' Different', value => value.items[0].preference = 'Red',
    value => value.items[0].product.checkoutSnapshot.unitPrice = 12,
  ];
  for (const mutate of variants) { const changed = structuredClone(input); mutate(changed); const result = await f.invoke(changed); assert.equal(result.statusCode, 409); assert.equal(result.body.code, 'ORDER_REFERENCE_CONFLICT'); }
  assert.deepEqual(f.orders, original); assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1);
});

test('failed second lookup cannot emit unavailable amendment proof', async () => {
  const f = fixture({ lookupFailureAt: 2, resolve: () => { throw Object.assign(new Error('Unavailable'),
    { status: 400, code: 'ORDER_PRODUCT_UNAVAILABLE' }); } });
  const response = await f.invoke(body());
  assert.equal(response.statusCode, 503); assert.equal(response.body.rejectedBeforeCapture, undefined);
  assert.equal(f.calls.lookups, 2); assert.equal(f.orders.length, 0); assert.equal(f.calls.team.length, 0);
});

for (const changed of [false, true]) test(`unavailable recheck after raced ${changed ? 'different' : 'matching'} capture emits no amendment proof`, async () => {
  let release; const captured = new Promise(resolve => release = resolve);
  const f = fixture({ resolve: async (items, count) => {
    if (count === 1) { await captured; throw Object.assign(new Error('Unavailable'),
      { status: 400, code: 'ORDER_PRODUCT_UNAVAILABLE' }); }
    return authoritative(items);
  }, onCaptured: () => release() });
  const input = body(); const first = f.invoke(input);
  while (f.calls.prices < 1) await new Promise(resolve => setTimeout(resolve, 1));
  const secondInput = structuredClone(input); if (changed) secondInput.items[0].qty++;
  const second = await f.invoke(secondInput); const late = await first;
  assert.equal(second.statusCode, 200); assert.equal(late.statusCode, changed ? 409 : 200);
  if (changed) assert.equal(late.body.code, 'ORDER_REFERENCE_CONFLICT');
  else assert.equal(late.body.orderId, second.body.orderId);
  assert.equal(late.body.rejectedBeforeCapture, undefined);
  assert.equal(f.orders.length, 1); assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1);
});

test('concurrent handler capture and replay send each channel only once', async () => {
  let release; const block = new Promise(resolve => release = resolve);
  const f = fixture({ beforeTeam: () => block }); const input = body();
  const first = f.invoke(input);
  while (!f.calls.team.length) await new Promise(resolve => setTimeout(resolve, 1));
  const second = await f.invoke(input); assert.equal(second.statusCode, 200);
  assert.equal(f.calls.team.length, 1);
  release(); const completed = await first; assert.equal(completed.statusCode, 200);
  const final = await f.invoke(input); assert.deepEqual(final.body, completed.body);
  assert.equal(f.orders.length, 1); assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1);
});

test('unique capture race rejects a different original request even if both early lookups were empty', async () => {
  let resolveFirst; let count = 0; const gate = new Promise(resolve => resolveFirst = resolve);
  const f = fixture({ resolve: async items => { count++; if (count === 1) await gate; else resolveFirst(); return authoritative(items); } });
  const a = body(); const b = structuredClone(a); b.items[0].qty = 3;
  const responses = await Promise.all([f.invoke(a), f.invoke(b)]);
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 409]);
  assert.equal(f.orders.length, 1); assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1);
});

test('stock validation race replays an order captured after the first lookup instead of fresh price review', async () => {
  let release; const captured = new Promise(resolve => release = resolve);
  const f = fixture({ resolve: async (items, count) => {
    if (count === 1) { await captured; const error = new Error('Price changed'); error.status = 409; error.code = 'ORDER_REVIEW_REQUIRED'; throw error; }
    return authoritative(items);
  }, onCaptured: () => release() });
  const input = body(); const first = f.invoke(input);
  while (f.calls.prices < 1) await new Promise(resolve => setTimeout(resolve, 1));
  const second = await f.invoke(input); const late = await first;
  assert.equal(second.statusCode, 200); assert.equal(late.statusCode, 200);
  assert.equal(late.body.orderId, second.body.orderId); assert.equal(f.orders.length, 1);
  assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1);
});

test('fallback attachment binds original protected snapshot and performs no unclaimed PDF storage', async () => {
  const f = fixture({ polishedPdfFail: true }); const input = body(); const first = await f.invoke(input);
  f.orders[0].items[0].qty = 999; f.orders[0].items[0].name = 'Edited owner row';
  f.orders[0].delivery_method = "Customer's own courier";
  const replay = await f.invoke(input); assert.deepEqual(replay.body, first.body);
  assert.equal(f.calls.fallback.length, 2); assert.deepEqual(f.calls.fallback[1], f.calls.fallback[0]);
  assert.equal(f.calls.fallback[1].items[0].qty, 2); assert.equal(f.calls.fallback[1].items[0].name, 'Verified notebook — Blue');
  assert.equal(f.calls.fallback[1].order.delivery_method, 'In store pick up');
  assert.equal(f.calls.pdf, 1); assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1);
});

test('late matching promo capture replays instead of reporting a spent code', async () => {
  let release; const captured = new Promise(resolve => release = resolve);
  const f = fixture({ resolve: async (items, count) => { if (count === 1) await captured; return authoritative(items); },
    onCaptured: () => release(), promoUsed: orders => orders.length > 0 });
  const input = body(); input.promoCode = 'PROTO75'; const first = f.invoke(input);
  while (f.calls.prices < 1) await new Promise(resolve => setTimeout(resolve, 1));
  const second = await f.invoke(input); const late = await first;
  assert.equal(second.statusCode, 200); assert.equal(late.statusCode, 200);
  assert.equal(late.body.orderId, second.body.orderId); assert.equal(f.orders.length, 1);
  assert.equal(f.calls.team.length, 1); assert.equal(f.calls.ack.length, 1);
});

test('failed customer channel retries alone with the same provider key and original snapshot', async () => {
  const f = fixture({ ackFail: true }); const input = body(); await f.invoke(input);
  const key = f.calls.ack[0].providerKey;
  f.options.ackFail = false; f.options.resolve = () => { throw new Error('fresh catalogue must not be read'); };
  const result = await f.invoke(input); assert.equal(result.statusCode, 200);
  assert.equal(f.calls.team.length, 1); assert.equal(f.calls.pdf, 1); assert.equal(f.calls.ack.length, 2);
  assert.equal(f.calls.ack[1].providerKey, key); assert.deepEqual(f.calls.ack[1].items, f.calls.ack[0].items);
  assert.equal([...f.jobs.values()].filter(job => job.status === 'succeeded').length, 3);
});

test('failed team channel retries without resending successful customer/PDF channels', async () => {
  const f = fixture({ teamFail: true }); const input = body(); const first = await f.invoke(input);
  assert.equal(first.body.emailDeliveryFailed, true); const key = f.calls.team[0].headers.idempotencyKey;
  f.options.teamFail = false; const recovered = await f.invoke(input);
  assert.equal(recovered.body.emailDeliveryFailed, false); assert.equal(f.calls.team.length, 2);
  assert.equal(f.calls.team[1].headers.idempotencyKey, key); assert.equal(f.calls.ack.length, 1); assert.equal(f.calls.pdf, 2);
  assert.equal(recovered.body.notify.statusAdvanced, true);
});

test('failed delivery acknowledgement retains the uncertain lease and does not immediately resend accepted email', async () => {
  const f = fixture({ finishUnavailable: args => args.p_channel === 'team_email' }); const input = body();
  const first = await f.invoke(input); assert.equal(first.statusCode, 200);
  await f.invoke(input); assert.equal(f.calls.team.length, 1);
  assert.equal([...f.jobs.values()].find(job => job.result?.messageId === 'team-message'), undefined);
  assert.ok([...f.jobs.values()].some(job => job.status === 'processing'));
});

test('missing migration fails closed before catalogue/capture/delivery; preview and auth remain gated', async () => {
  for (const options of [{ missingSchema: true }, { preview: true }, { denied: true }]) {
    const f = fixture(options); const result = await f.invoke(body()); assert.ok([403, 503].includes(result.statusCode));
    assert.equal(f.calls.prices, 0); assert.equal(f.orders.length, 0); assert.equal(f.calls.team.length, 0); assert.equal(f.calls.ack.length, 0);
  }
});

test('unprotected historical reference fails closed rather than adopting a new payload', async () => {
  const f = fixture(); const input = body(); f.orders.push({ id: randomUUID(), customer_id: user.id, client_ref: input.clientRef, items: [] });
  const result = await f.invoke(input); assert.equal(result.statusCode, 409); assert.equal(f.calls.prices, 0); assert.equal(f.calls.team.length, 0);
});

test('fingerprint ignores untrusted cosmetic product values but binds the actual customer intent', () => {
  const input = body(); const changed = structuredClone(input); changed.items[0].product.name = 'Different cosmetic title'; changed.items[0].product.price = 1;
  assert.equal(checkoutRequestHash(input), checkoutRequestHash(changed));
  changed.items[0].product.isExtendedRange = true; assert.notEqual(checkoutRequestHash(input), checkoutRequestHash(changed));
});

test('real authoritative resolver rejects changed stock/prices and never accepts client prices or title', async () => {
  const previousFetch = globalThis.fetch; const previousUrl = process.env.VITE_STOCK_SUPABASE_URL; const previousKey = process.env.VITE_STOCK_SUPABASE_KEY;
  process.env.VITE_STOCK_SUPABASE_URL = 'https://synthetic-stock.example.invalid'; process.env.VITE_STOCK_SUPABASE_KEY = 'synthetic-only';
  const row = { sku: 'SKU-1', barcode: '1001', title: 'Server notebook', price: 10, units_of_issue: 'EACH', min_order_qty: 1, stock_qty: 100, available_stock: 100, to_order: false };
  globalThis.fetch = async url => {
    assert.equal(new URL(url).hostname, 'synthetic-stock.example.invalid');
    return new Response(JSON.stringify(String(url).includes('/rpc/') ? [] : [row]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const input = body(); const resolved = await resolveAuthoritativePrices(input.items);
    assert.equal(resolved[0].product.price, 10); assert.equal(resolved[0].product.name, 'Server notebook');
    row.price = -1;
    await assert.rejects(() => resolveAuthoritativePrices(input.items), error => error.status === 400
      && error.code === 'ORDER_PRODUCT_UNAVAILABLE');
    row.price = 12; row.available_stock = 0;
    await assert.rejects(() => resolveAuthoritativePrices(input.items), error => error.code === 'ORDER_REVIEW_REQUIRED');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.VITE_STOCK_SUPABASE_URL; else process.env.VITE_STOCK_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.VITE_STOCK_SUPABASE_KEY; else process.env.VITE_STOCK_SUPABASE_KEY = previousKey;
  }
});

test('handler rejects forged/restored preference lines whose combined resolved SKU quantity exceeds stock', async () => {
  const previousFetch = globalThis.fetch; const previousUrl = process.env.VITE_STOCK_SUPABASE_URL; const previousKey = process.env.VITE_STOCK_SUPABASE_KEY;
  process.env.VITE_STOCK_SUPABASE_URL = 'https://synthetic-stock.example.invalid'; process.env.VITE_STOCK_SUPABASE_KEY = 'synthetic-only';
  const row = { sku: 'SKU-1', barcode: '1001', title: 'Server notebook', price: 10, units_of_issue: 'EACH', min_order_qty: 1, stock_qty: 10, available_stock: 10, to_order: false };
  globalThis.fetch = async url => {
    assert.equal(new URL(url).hostname, 'synthetic-stock.example.invalid');
    return new Response(JSON.stringify(String(url).includes('/rpc/') ? [] : [row]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const input = body(); input.items[0].qty = 6; input.items[0].preference = 'Red'; input.items[0].product.checkoutSnapshot.stockQty = 10;
    const blue = structuredClone(input.items[0]); blue.preference = 'Blue';
    // Force the second line through barcode resolution; it is still the same
    // authoritative SKU and must not receive a second independent stock cap.
    blue.product.sku = ''; blue.product.id = ''; input.items.push(blue);
    const f = fixture({ resolve: items => resolveAuthoritativePrices(items) });
    const rejected = await f.invoke(input);
    assert.equal(rejected.statusCode, 409); assert.equal(rejected.body.code, 'ORDER_REVIEW_REQUIRED');
    assert.equal(rejected.body.changes[0].requestedQty, 12); assert.equal(rejected.body.changes[0].currentStockQty, 10);
    assert.equal(f.orders.length, 0); assert.equal(f.calls.team.length, 0); assert.equal(f.calls.ack.length, 0);
    input.items[0].qty = 4; const accepted = await f.invoke(input);
    assert.equal(accepted.statusCode, 200); assert.equal(f.orders[0].items.length, 2);
    assert.deepEqual(f.orders[0].items.map(item => item.preference), ['Red', 'Blue']);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.VITE_STOCK_SUPABASE_URL; else process.env.VITE_STOCK_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.VITE_STOCK_SUPABASE_KEY; else process.env.VITE_STOCK_SUPABASE_KEY = previousKey;
  }
});
