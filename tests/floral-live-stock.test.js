import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFloralLiveStock, FLORAL_LIVE_CODES, readFloralLiveStock } from '../lib/floral-live-stock.mjs';
import { createStockHandler } from '../api/stock.js';
const bridgeEnv = { STOCK_SQL_BRIDGE_URL: 'https://read-only.example', STOCK_SQL_BRIDGE_KEY: 'test' };
const incoming = { incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001, incomingEta: '2026-07-30' };
test('all five exact codes read current balances without mutating input or markers', async () => {
  const products = FLORAL_LIVE_CODES.map(code => ({ barcode: code, stockQty: 0, availability: { ...incoming } }));
  products.push({ barcode: 'UNRELATED', stockQty: 9 });
  const original = structuredClone(products); const requests = [];
  const result = await applyFloralLiveStock(products, { bridgeEnv, fetchBridge: async (url, request) => {
    requests.push({url,request}); const {sku} = JSON.parse(request.body);
    return { ok: true, json: async () => ({ row: { CODE: sku, ONHAND: 74, BOOKED: 2 } }) };
  }});
  assert.deepEqual(products, original);
  assert.equal(requests.length, 5);
  for (const p of result.slice(0,5)) {
    assert.equal(p.stockQty,72); assert.equal(p.stockOnHand,72); assert.equal(p.inStock,true);
    assert.equal(p.availability.incomingQty,0.001); assert.equal(p.availability.incomingStatus,incoming.incomingStatus);
    assert.equal(p.availability.state,'in_stock'); assert.equal(p.stockSource,'live_positill');
  }
  assert.equal(result[5],products[5]);
  assert.ok(requests.every(r => r.url.endsWith('/stmast') && r.request.method === 'POST'));
});
test('identity mismatch and incomplete balances cannot become false stock', async () => {
  for (const row of [{ CODE:'OTHER',ONHAND:72,BOOKED:0 }, {CODE:FLORAL_LIVE_CODES[0],ONHAND:null,BOOKED:0}, {CODE:FLORAL_LIVE_CODES[0],ONHAND:72,BOOKED:-1}]) {
    await assert.rejects(readFloralLiveStock(FLORAL_LIVE_CODES[0],{bridgeEnv,fetchBridge:async()=>({ok:true,json:async()=>({row})})}));
  }
});
test('failed bridge shows unknown rather than saved zero and retains incoming data', async () => {
  const [result] = await applyFloralLiveStock([{barcode:FLORAL_LIVE_CODES[0],stockQty:0,availability:incoming}], {bridgeEnv,fetchBridge:async()=>{throw Error('offline');}});
  assert.equal(result.stockQty,null); assert.equal(result.stockSource,'unavailable');
  assert.equal(result.availability.guidance,'Live stock check unavailable');
  assert.equal(result.availability.canOrder,true); assert.equal(result.availability.incomingQty,0.001);
});
test('fresh reads can change including a verified zero; no success is cached indefinitely', async () => {
  let qty=72;
  const options={bridgeEnv,fetchBridge:async()=>({ok:true,json:async()=>({row:{CODE:FLORAL_LIVE_CODES[0],ONHAND:qty,BOOKED:0}})})};
  assert.equal((await readFloralLiveStock(FLORAL_LIVE_CODES[0],options)).qty,72);
  qty=0; assert.equal((await readFloralLiveStock(FLORAL_LIVE_CODES[0],options)).qty,0);
});

test('approved customer stock endpoint reads Positill and preserves receipt metadata', async () => {
  const code = FLORAL_LIVE_CODES[0];
  const row = {sku:code,barcode:code,available_stock:0,stock_qty:0};
  const client = {
    from(table) { assert.equal(table,'website_stock'); return {select(){return this;},or(){return this;},limit:async()=>({data:[row]})}; },
    async rpc(name) { assert.equal(name,'get_website_product_availability'); return {data:[{sku:code,incoming_status:incoming.incomingStatus,incoming_qty:incoming.incomingQty}]}; },
  };
  const response = {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};
  await createStockHandler({authenticate:async()=>({id:'test'}),approve:async()=>true,getClient:()=>client,bridgeEnv,fetchBridge:async()=>({ok:true,json:async()=>({row:{CODE:code,ONHAND:72,BOOKED:0}})})})({method:'GET',query:{sku:code}},response);
  assert.equal(response.code,200); assert.equal(response.body.qty,72);
  assert.equal(response.body.stock_source,'live_positill');
  assert.equal(response.body.availability.incomingQty,0.001);
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(row.stock_qty,0);
});
