// LOCAL ONLY; all stores, email and source adapters are in-memory test doubles.
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createSendOrderHandler, resolveAuthoritativePrices, resolveInstorePrices } from '../api/send-order.js';
import { checkoutRequestHash } from '../api/_order-replay.js';
import {createWebsiteOnlyProvider} from '../api/_website-only-provider.js';

const user = { id: '10000000-0000-4000-8000-000000000001', email: 'buyer@example.invalid' };
const body = () => ({ clientRef: randomUUID(), deliveryMethod: 'In store pick up', customerNotes: 'Deliver carefully', items: [{ qty: 2, preference: 'Blue', product: { id: 'SKU-1', sku: 'SKU-1', code: '1001', name: 'Forged title', price: 99999, checkoutSnapshot: { unitPrice: 10, stockQty: 100 } } }] });
const authoritative = (items) => items.map(item => ({ qty: item.qty, preference: item.preference, product: { id: 'SKU-1', sku: 'SKU-1', code: '1001', name: 'Verified notebook', price: 10, unitsOfIssue: 'EACH' } }));

function fixture(options = {}) {
  const orders = []; const jobs = new Map(); const calls = { prices: 0, team: [], ack: [], pdf: 0, fallback: [], profile: 0, patches: 0 };
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


test('synthetic website-only listing goes through real order handler with isolated ports', async () => {
 const now=Date.now(),sku='TEST-SAR-001',sha='a'.repeat(64),path='/test/photo.jpg';
 const input={manifest:{items:[{sku,description:'TEST DRUM',units:'EACH',category:'Test',mainPath:path,mainSha256:sha,photos:[{path,sha256:sha}]}]},observations:[{sku,found:true,description:'TEST DRUM',units:'EACH',price:11.5,onHand:20,booked:1,observedAt:now}],existing:{complete:true,identifiers:[]},controls:{complete:true,hiddenListings:[],hiddenImages:[]},now};
 const bridge={CODE:sku,DESCR:'TEST DRUM',UNITS:'EACH',PRICE_A:10,ONHAND:20,BOOKED:1};
 const provider=createWebsiteOnlyProvider({manifest:input.manifest,readEvidence:async()=>input,origin:'https://example.test',now:()=>now});
 const index={from(name){if(!['extended_range_items','website_stock','instore_listing_controls'].includes(name))throw Error('unexpected table');const q={select(){return q},in(){return Promise.resolve({data:[],error:null})}};return q;}};
 const fetchBridge=async()=>({ok:true,json:async()=>({row:bridge})});
 const f=fixture({resolve: async items => {
  const oldUrl=process.env.STOCK_SQL_BRIDGE_URL,oldKey=process.env.STOCK_SQL_BRIDGE_KEY;
  process.env.STOCK_SQL_BRIDGE_URL='https://test.invalid';process.env.STOCK_SQL_BRIDGE_KEY='synthetic';
  try {return await resolveAuthoritativePrices(items,{websiteOnlyProvider:provider,index,fetchBridge});}
  finally {if(oldUrl===undefined)delete process.env.STOCK_SQL_BRIDGE_URL;else process.env.STOCK_SQL_BRIDGE_URL=oldUrl;if(oldKey===undefined)delete process.env.STOCK_SQL_BRIDGE_KEY;else process.env.STOCK_SQL_BRIDGE_KEY=oldKey;}
 }});
 const request=body(); request.items[0].product={id:sku,sku,code:sku,name:'Forged title',price:99999,isExtendedRange:true};
 const response=await f.invoke(request); assert.equal(response.statusCode,200);assert.equal(f.orders.length,1);
 assert.equal(f.orders[0].items[0].unitPrice,11.5);assert.ok(JSON.stringify(f.orders[0].items[0]).includes(sku));
 assert.equal(f.calls.team.length,1);assert.equal(f.calls.ack.length,1);
});
