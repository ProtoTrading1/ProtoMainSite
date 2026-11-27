import test from 'node:test';
import assert from 'node:assert/strict';
import {createStockHandler} from '../api/stock.js';
import {resolveStandardPrices} from '../api/send-order.js';
import {validateShowroomStockObservation} from '../lib/showroom-live-stock.mjs';

const code='8640000255';
const image='https://images.example.test/unchanged-main.jpg';
const balloon={sku:code,barcode:code,title:'Christmas balloons',price:27.5,image_url_one:image,
 units_of_issue:'PACK 12',min_order_qty:1,available_stock:96,stock_qty:96,to_order:false};
function client(rows,incoming=[]){return {from(table){assert.equal(table,'website_stock');const q={
 select(){return q;},or(){return q;},eq(){return q;},limit(){return Promise.resolve({data:rows});},
 in(field,values){return Promise.resolve({data:rows.filter(row=>values.includes(row[field]))});}};return q;},
 async rpc(name){assert.equal(name,'get_website_product_availability');return {data:incoming};}};}
const source=(qty,units='PKT,12')=>validateShowroomStockObservation(code,{CODE:code,ONHAND:qty,BOOKED:0,UNITS:units});
const request={method:'GET',query:{sku:code}};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};}
const item=(row,qty)=>({qty,product:{sku:row.sku,code:row.barcode,checkoutSnapshot:{unitPrice:row.price,stockQty:96}}});

test('authenticated stock check reads exact Positill despite stale96 and no mirrored product',async()=>{
 const res=response(), calls=[];
 const handler=createStockHandler({authenticate:async()=>({id:'synthetic'}),approve:async()=>true,
  getClient:()=>client([balloon]),readStock:async codes=>{calls.push(codes);return new Map([[code,source(68)]]);}});
 await handler(request,res);
 assert.equal(res.code,200);assert.deepEqual(calls,[[code]]);assert.equal(res.data.qty,68);
 assert.equal(res.data.stock_source,'positill_live');assert.equal(res.data.source_code,code);
 assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(balloon.available_stock,96);
});
test('source outage or selling-unit mismatch never stamps96 as live or invents zero',async()=>{
 for(const proof of [null,source(68,'EACH')]){
  const res=response();await createStockHandler({authenticate:async()=>({}),approve:async()=>true,
   getClient:()=>client([balloon]),readStock:async()=>new Map([[code,proof]])})(request,res);
  assert.equal(res.code,200);assert.equal(res.data.qty,null);assert.equal(res.data.checked_at,null);
  assert.equal(res.data.stock_source,'unavailable');assert.equal(res.data.availability.canOrder,false);
 }
});
test('authentication and approval precede any Positill read',async()=>{
 for(const approved of [false,true]){
  let reads=0;const res=response();
  await createStockHandler({authenticate:async()=>approved?null:{},approve:async()=>false,
   getClient:()=>client([balloon]),readStock:async()=>{reads++;return new Map();}})(request,res);
  assert.equal(reads,0);
 }
});
test('punctuated website aliases use escaped exact equality and bind their actual source barcode',async()=>{
 for(const alias of ['0005-BLK.1','0022-BLK-25,5','048 (401)']){
  const row={...balloon,sku:alias};let equality,sourceReads=0;
  const db=client([row]);const original=db.from;
  db.from=table=>{const query=original(table);query.or=()=>{throw Error('Website alias must not enter an or filter');};query.eq=(field,value)=>{equality=[field,value];return query;};return query;};
  const res=response();await createStockHandler({authenticate:async()=>({}),approve:async()=>true,getClient:()=>db,
   readStock:async codes=>{sourceReads++;assert.deepEqual(codes,[code]);return new Map([[code,source(68)]]);}})(
    {method:'GET',query:{sku:code,website_sku:alias}},res);
  assert.equal(res.code,200);assert.deepEqual(equality,['sku',alias]);assert.equal(res.data.sku,alias);
  assert.equal(res.data.source_code,code);assert.equal(res.data.qty,68);assert.equal(sourceReads,1);
 }
});
test('website alias cannot select a different Positill pool or fall through into Instore',async()=>{
 for(const rows of [[{...balloon,sku:'0005-BLK.1'}],[]]){
  let reads=0;const res=response();await createStockHandler({authenticate:async()=>({}),approve:async()=>true,getClient:()=>client(rows),
   readStock:async()=>{reads++;return new Map();}})({method:'GET',query:{sku:'OTHER',website_sku:'0005-BLK.1'}},res);
  assert.ok(res.code===502||res.code===404);assert.equal(reads,0);
 }
});
test('verified Motarro symbol source codes remain exact parameterized stock reads',async()=>{
 for(const [symbol,balance]of [['@',25],['&',65]]){
  const sourceCode=`ME095-${symbol}`,row={...balloon,sku:sourceCode,barcode:sourceCode,units_of_issue:'EACH'};
  const observation=validateShowroomStockObservation(sourceCode,{CODE:sourceCode,ONHAND:balance,BOOKED:0,UNITS:'EACH'});
  const res=response();await createStockHandler({authenticate:async()=>({}),approve:async()=>true,getClient:()=>client([row]),
   readStock:async codes=>{assert.deepEqual(codes,[sourceCode]);return new Map([[sourceCode,observation]]);}})(
    {method:'GET',query:{sku:sourceCode,website_sku:sourceCode}},res);
  assert.equal(res.code,200);assert.equal(res.data.qty,balance);assert.equal(res.data.source_code,sourceCode);
 }
});
test('malformed or control-bearing query identities fail before authentication or source work',async()=>{
 for(const query of [{sku:code+'\n'},{sku:[code]},{sku:code,website_sku:'ALIAS\t'}]){
  let authenticated=0;const res=response();await createStockHandler({authenticate:async()=>{authenticated++;return {};}})(
    {method:'GET',query},res);
  assert.equal(res.code,400);assert.equal(authenticated,0);
 }
});
test('barcode variants share one fresh pool at checkout and retain mains, prices and requested quantities',async()=>{
 const rows=[{...balloon,sku:'BALL-WHITE'},{...balloon,sku:'BALL-RED',image_url_one:image+'?red'}];
 const reads=[];const resolved=await resolveStandardPrices(rows.map(row=>item(row,40)),{index:client(rows),
  readStock:async codes=>{reads.push(codes);return new Map([[code,source(68)]]);}});
 assert.deepEqual(reads,[[code]]);assert.deepEqual(resolved.map(row=>row.qty),[40,40]);
 for(const line of resolved){assert.equal(line.product.stockOnHand,68);assert.equal(line.product.stockRequest.availableQty,68);
  assert.equal(line.product.stockRequest.requestedQty,80);assert.equal(line.product.stockRequest.shortfallQty,12);
  assert.equal(line.product.stockRequest.sharedStock,true);assert.equal(line.product.price,27.5);assert.equal(line.product.unitsOfIssue,'PACK 12');}
 assert.deepEqual(resolved.map(line=>line.product.image),rows.map(row=>row.image_url_one));
});
test('checkout source failure retains explicit unverified staff-request policy, never cached96',async()=>{
 const [line]=await resolveStandardPrices([item(balloon,4)],{index:client([balloon]),readStock:async()=>new Map([[code,null]])});
 assert.equal(line.qty,4);assert.equal(line.product.stockOnHand,null);assert.equal(line.product.stockRequest.stockUnverified,true);
 assert.equal(line.product.stockSource,'unavailable');assert.equal(line.product.image,image);
});
test('a source SKU with null barcode shares its pool with a barcode-mapped website alias',async()=>{
 const rows=[{...balloon,barcode:null},{...balloon,sku:'BALL-RED'}];
 const lines=await resolveStandardPrices(rows.map(row=>item(row,40)),{index:client(rows),readStock:async codes=>{
  assert.deepEqual(codes,[code]);return new Map([[code,source(68)]]);
 }});
 for(const line of lines){assert.equal(line.product.stockRequest.sharedStock,true);assert.equal(line.product.stockRequest.requestedQty,80);
  assert.equal(line.product.stockRequest.availableQty,68);assert.equal(line.product.stockRequest.shortfallQty,12);}
});
test('fresh zero preserves verified arrival and To-order semantics without altering arrival records',async()=>{
 const marker={sku:code,incoming_status:'landed_awaiting_grv',incoming_qty:20};
 for(const row of [balloon,{...balloon,to_order:true}]){
  const [line]=await resolveStandardPrices([item(row,4)],{index:client([row],[marker]),readStock:async()=>new Map([[code,source(0)]])});
  assert.equal(line.qty,4);assert.equal(line.product.stockOnHand,0);assert.equal(line.product.stockRequest,undefined);
 }
 assert.equal(marker.incoming_qty,20);
});
