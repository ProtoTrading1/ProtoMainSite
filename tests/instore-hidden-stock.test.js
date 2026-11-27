import test from 'node:test';
import assert from 'node:assert/strict';
import {createStockHandler,readFreshInstoreStock} from '../api/stock.js';
import {resolveAuthoritativePrices} from '../api/send-order.js';
const sku='8731700001';
const row={sku,barcode:'',title:'TUMBLER CAN W/BAMBOO LID STRAW 500ml',price:35,available_stock:11,minimum_stock:1,image_source:'nutstore',image_source_key:'sha256:'+'a'.repeat(64),image_url:'https://images.example.test/tumbler.jpg',image_review_status:'verified',visibility_status:'search_only',is_active:true};
const bridgeEnv={STOCK_SQL_BRIDGE_URL:'https://fixture.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic-only'};
export function stockFixture({status='hidden',controlError=false,controlData,authenticate=async()=>({id:'synthetic-customer'})}={}){
 const reads=[],sourceCalls=[],providerCalls=[];
 const db={from(table){reads.push(table);const query={select(){return query;},eq(){return query;},limit(){return query;},in(){return query;},or(){return query;},then(resolve){return Promise.resolve({data:table==='extended_range_items'?[{...row}]:table==='instore_listing_controls'?(controlData===undefined?(status?[{sku,status}]:[]):controlData):[],error:table==='instore_listing_controls'&&controlError?Error('controls offline'):null}).then(resolve);}};return query;},rpc:async()=>({data:[],error:null})};
 const fetchBridge=async(url,options)=>{sourceCalls.push({url,body:JSON.parse(options.body)});return Response.json({row:{CODE:sku,DESCR:row.title,UNITS:'EACH',PRICE_A:30.43,ONHAND:11,BOOKED:0}});};
 const provider=async options=>{providerCalls.push(options);return {rows:[]};};
 const handler=createStockHandler({authenticate,approve:async()=>true,getClient:()=>db,websiteOnlyProvider:provider,fetchBridge,bridgeEnv});
 return {db,fetchBridge,provider,reads,sourceCalls,providerCalls,handler};
}
const response=()=>({setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}});
test('hidden normal actual-row 8731700001 never re-verifies a cached card through HTTP stock',async()=>{
 const f=stockFixture(),res=response();await f.handler({method:'GET',query:{sku}},res);
 assert.equal(res.statusCode,404);assert.equal(res.body.qty,undefined);assert.equal(res.body.unitsOfIssueVerified,undefined);assert.deepEqual(f.sourceCalls,[]);assert.deepEqual(f.providerCalls,[]);assert.ok(f.reads.includes('instore_listing_controls'));
});
test('visible or absent listing control retains the exact ordinary stock/unit read and does not alter source/index data',async()=>{
 for(const status of ['visible',null]){const f=stockFixture({status}),res=response(),before=structuredClone(row);await f.handler({method:'GET',query:{sku}},res);
  assert.equal(res.statusCode,200);assert.equal(res.body.qty,11);assert.equal(res.body.unitsOfIssue,'EACH');assert.equal(res.body.unitsOfIssueVerified,true);assert.equal(f.sourceCalls.length,1);assert.deepEqual(f.sourceCalls[0].body,{sku});assert.deepEqual(row,before);}
});
test('unavailable or malformed listing controls fail closed before any bridge/provider read',async()=>{
 for(const options of [{controlError:true},{controlData:null},{controlData:[{sku,status:'unknown'}]},{controlData:[{sku:'OTHER',status:'visible'}]},{controlData:[{sku,status:'visible'},{sku,status:'hidden'}]}]){
  const f=stockFixture(options);await assert.rejects(()=>readFreshInstoreStock(sku,{indexClient:f.db,websiteOnlyProvider:f.provider,fetchBridge:f.fetchBridge,bridgeEnv}));assert.equal(f.sourceCalls.length,0);assert.equal(f.providerCalls.length,0);
 }
});
test('stock authentication denial performs no database, provider or source reads',async()=>{
 const f=stockFixture({authenticate:async()=>null}),res=response();await f.handler({method:'GET',query:{sku}},res);assert.deepEqual(f.reads,[]);assert.deepEqual(f.sourceCalls,[]);assert.deepEqual(f.providerCalls,[]);
});
test('a retained basket or forged Instore flag cannot order the explicitly hidden SKU',async()=>{
 for(const flag of [true,false]){const f=stockFixture(),item={qty:1,product:{id:sku,sku,isExtendedRange:flag,price:35,unitsOfIssue:'EACH'}};
  await assert.rejects(()=>resolveAuthoritativePrices([item],{index:f.db,classify:async()=>new Set([sku]),fetchBridge:f.fetchBridge,bridgeEnv}),error=>error.status===409&&/no longer available/.test(error.message));
  assert.equal(item.qty,1);assert.equal(item.product.price,35);
 }
});
