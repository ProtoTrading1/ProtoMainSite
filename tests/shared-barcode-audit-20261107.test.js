import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveAuthoritativePrices} from '../api/send-order.js';
import {validateShowroomStockObservation} from '../lib/showroom-live-stock.mjs';

test('separate website SKUs sharing a barcode flag a combined stock shortage without dropping requests',async()=>{
 const rows=['TEST-GROUP-A','TEST-GROUP-B'].map(sku=>({sku,barcode:'TEST-SHARED',title:'Synthetic variant',price:6,units_of_issue:'EACH',min_order_qty:1,available_stock:3,stock_qty:3,to_order:false}));
 let sourceQty=3;
 const options={classify:async()=>new Set(),readStock:async codes=>new Map(codes.map(code=>{assert.ok(['TEST-SHARED','TEST-OTHER'].includes(code));return [code,validateShowroomStockObservation(code,{CODE:code,ONHAND:sourceQty,BOOKED:0,UNITS:'EACH'})];}))};
 const oldFetch=globalThis.fetch,oldUrl=process.env.VITE_STOCK_SUPABASE_URL,oldKey=process.env.VITE_STOCK_SUPABASE_KEY;
 process.env.VITE_STOCK_SUPABASE_URL='https://synthetic-checkout.invalid';process.env.VITE_STOCK_SUPABASE_KEY='synthetic';
 globalThis.fetch=async(input)=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.hostname,'synthetic-checkout.invalid');const data=url.pathname.endsWith('/website_stock')?rows:url.pathname.endsWith('/get_website_product_availability')?[]:null;assert.notEqual(data,null);return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});};
 try {
  const items=rows.map(row=>({qty:2,product:{sku:row.sku,barcode:row.barcode,code:row.barcode,checkoutSnapshot:{unitPrice:6,stockQty:3}}}));
  const over=await resolveAuthoritativePrices(items,options);
  assert.deepEqual(over[0].product.stockRequest,{availableQty:3,requestedQty:4,shortfallQty:1,sharedStock:true});
  items[1].qty=1;const resolved=await resolveAuthoritativePrices(items,options);assert.equal(resolved.length,2);assert.equal(resolved.reduce((sum,line)=>sum+line.qty,0),3);
  rows[1].available_stock=2;rows[1].stock_qty=2;items[1].product.checkoutSnapshot.stockQty=2;
  sourceQty=2;
  assert.equal((await resolveAuthoritativePrices(items,options))[0].product.stockRequest.shortfallQty,1);
  rows[1].units_of_issue='PACK 10';
  await assert.rejects(()=>resolveAuthoritativePrices(items,options),error=>error.code==='SHARED_STOCK_UNIT_MISMATCH');
  rows[1].units_of_issue='EACH';
  rows[1].barcode='TEST-OTHER';items[1].product.barcode='TEST-OTHER';items[1].product.code='TEST-OTHER';
  assert.equal((await resolveAuthoritativePrices(items,options)).length,2);
 } finally {globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.VITE_STOCK_SUPABASE_URL;else process.env.VITE_STOCK_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_STOCK_SUPABASE_KEY;else process.env.VITE_STOCK_SUPABASE_KEY=oldKey;}
});

