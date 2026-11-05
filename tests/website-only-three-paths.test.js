import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadLiveInstoreCatalogue,createExtendedRangeHandler} from '../api/extended-range.js';
import {readFreshInstoreStock,createStockHandler} from '../api/stock.js';
import {resolveInstorePrices,detectUnflaggedInstoreSkus,resolveAuthoritativePrices} from '../api/send-order.js';
import {createWebsiteOnlyProvider} from '../api/_website-only-provider.js';

const sku='TEST-SAR-001';
const row={sku,barcode:sku,title:'TEST DRUM',original_description:'TEST DRUM',price:11.5,available_stock:19,
 category:'Test',image_url:'https://example.test/test.jpg',image_source:'nutstore',image_review_status:'verified',visibility_status:'search_only',is_active:true};
const bridge={CODE:sku,DESCR:'TEST DRUM',UNITS:'EACH',PRICE_A:10,ONHAND:20,BOOKED:1};
function client(tables) {return {from(name){
 if (!(name in tables)) throw Error('Unexpected table '+name);
 let filters=[];const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},
 in(k,v){filters.push(x=>v.includes(x[k]));return q},or(){return q},gt(){return q},like(){return q},order(){return q},
 range(a,b){const data=tables[name].filter(x=>filters.every(f=>f(x)));return Promise.resolve({data:data.slice(a,b+1),count:data.length,error:null})},
 limit(n){return Promise.resolve({data:tables[name].filter(x=>filters.every(f=>f(x))).slice(0,n),error:null})},
 then(resolve,reject){return Promise.resolve({data:tables[name].filter(x=>filters.every(f=>f(x))),error:null}).then(resolve,reject)}};return q;
 }};}
const tables=()=>({extended_range_items:[],website_stock:[],instore_image_controls:[],instore_listing_controls:[]});
const fetchBridge=async()=>({ok:true,json:async()=>({row:bridge})});

test('a restored basket cannot silently classify an unverified prepared item as a standard product', async()=>{
 const item={product:{sku:'A-BRA1003',code:'A-BRA1003'}};
 await assert.rejects(detectUnflaggedInstoreSkus([item],client(tables()),{websiteOnlyProvider:async()=>({rows:[],held:[{sku:'A-BRA1003'}]})}),/could not be verified/);
 const broken={from(){throw Error('database unavailable')}};
 await assert.rejects(detectUnflaggedInstoreSkus([item],broken,{websiteOnlyProvider:async()=>({rows:[{...row,sku:'A-BRA1003'}]})}),/could not be verified/);
});

test('website-only row traverses actual catalogue, fresh stock and order-resolution paths with isolated ports',async()=>{
 const oldUrl=process.env.STOCK_SQL_BRIDGE_URL,oldKey=process.env.STOCK_SQL_BRIDGE_KEY;
 process.env.STOCK_SQL_BRIDGE_URL='https://test.invalid';process.env.STOCK_SQL_BRIDGE_KEY='synthetic';
 try {
  const db=client(tables()),original=structuredClone(row);
  const browse=await loadLiveInstoreCatalogue(db,{websiteOnlyRows:[row]});
  assert.equal(browse.products.length,1);assert.equal(browse.products[0].sku,sku);
  const stock=await readFreshInstoreStock(sku,{websiteOnlyRows:[row],indexClient:db,fetchBridge});
  assert.equal(stock.qty,19);assert.equal(stock.unitsOfIssue,'EACH');
  const result=await resolveInstorePrices([{qty:1,preference:'Blue',product:{sku,isExtendedRange:true,price:0.01}}],{websiteOnlyRows:[row],index:db,fetchBridge});
  assert.equal(result[0].product.sku,sku);assert.equal(result[0].product.price,11.5);assert.equal(result[0].preference,'Blue');
  const recovered=await detectUnflaggedInstoreSkus([{product:{sku,code:sku}}],db,{websiteOnlyRows:[row]});
  assert.equal(recovered.has(sku),true);
  assert.deepEqual(row,original);
 } finally {
  if(oldUrl===undefined)delete process.env.STOCK_SQL_BRIDGE_URL;else process.env.STOCK_SQL_BRIDGE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.STOCK_SQL_BRIDGE_KEY;else process.env.STOCK_SQL_BRIDGE_KEY=oldKey;
 }
});

test('index collisions are rejected and browsing respects removal controls',async()=>{
 const t=tables();t.extended_range_items.push({...row});
 await assert.rejects(()=>loadLiveInstoreCatalogue(client(t),{websiteOnlyRows:[row]}),/collision/);
 const clear=tables();clear.instore_listing_controls.push({sku,status:'hidden'});
 const browse=await loadLiveInstoreCatalogue(client(clear),{websiteOnlyRows:[row]});
 assert.equal(browse.products.length,0);
 assert.equal(await readFreshInstoreStock(sku,{websiteOnlyRows:[row],indexClient:client(clear),fetchBridge}),null);
 const duplicate=tables();duplicate.website_stock.push({sku,barcode:sku});
 assert.equal(await readFreshInstoreStock(sku,{websiteOnlyRows:[row],indexClient:client(duplicate),fetchBridge}),null);
});

test('all 163 prepared products traverse the three integration functions using synthetic observations',async()=>{
 const {items}=JSON.parse(await readFile(new URL('../api/_website-only-manifest.json',import.meta.url),'utf8'));
 const data=items.map(x=>({sku:x.sku}));
 const bySku=new Map(items.map(x=>[x.sku,{sku:x.sku,description:x.description,units:x.units,price_a_ex_vat:10,website_price_incl_vat:11.5,on_hand:20,booked:1}]));
 const now=Date.now();
 const observations=[...bySku.values()].map(s=>({sku:s.sku,found:true,description:s.description,units:s.units,price:s.website_price_incl_vat,onHand:s.on_hand,booked:s.booked,observedAt:now}));
 const evidence={observations,existing:{complete:true,identifiers:[]},controls:{complete:true,hiddenListings:[],hiddenImages:[]}};
 const provider=createWebsiteOnlyProvider({manifest:{items},readEvidence:async()=>evidence,origin:'https://example.test',now:()=>now});
 assert.equal(data.length,163);const db=client(tables());
 const oldUrl=process.env.STOCK_SQL_BRIDGE_URL,oldKey=process.env.STOCK_SQL_BRIDGE_KEY,oldWarn=console.warn;
 process.env.STOCK_SQL_BRIDGE_URL='https://test.invalid';process.env.STOCK_SQL_BRIDGE_KEY='synthetic';console.warn=()=>{};
 const simulatedBridge=async(_url,options)=>{const s=bySku.get(JSON.parse(options.body).sku);return {ok:!!s,json:async()=>({row:s&&{CODE:s.sku,DESCR:s.description,UNITS:s.units,PRICE_A:s.price_a_ex_vat,ONHAND:s.on_hand,BOOKED:s.booked}})}};
 try {
  assert.equal((await provider()).rows.length,163);
  const browse=await loadLiveInstoreCatalogue(db,{websiteOnlyProvider:provider});assert.equal(browse.products.length,163);
  for(const indexRow of data){
   const source=bySku.get(indexRow.sku);
   const stock=await readFreshInstoreStock(indexRow.sku,{websiteOnlyProvider:provider,indexClient:db,fetchBridge:simulatedBridge});
   assert.equal(stock.qty,Math.floor(source.on_hand-source.booked),indexRow.sku);
   const [order]=await resolveInstorePrices([{qty:1,product:{sku:indexRow.sku,isExtendedRange:true,price:0.01}}],{websiteOnlyProvider:provider,index:db,fetchBridge:simulatedBridge});
   assert.equal(order.product.sku,indexRow.sku);assert.equal(order.product.price,source.website_price_incl_vat,indexRow.sku);
  }
 } finally {
  console.warn=oldWarn;if(oldUrl===undefined)delete process.env.STOCK_SQL_BRIDGE_URL;else process.env.STOCK_SQL_BRIDGE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.STOCK_SQL_BRIDGE_KEY;else process.env.STOCK_SQL_BRIDGE_KEY=oldKey;
 }
});

test('website-only provider holds changed or hidden rows without losing verified neighbours',async()=>{
 const now=Date.now(),sha='a'.repeat(64),photo='/test/photo.jpg';
 const item=(code)=>({sku:code,description:'TEST DRUM',units:'EACH',category:'Test',mainPath:photo,mainSha256:sha,photos:[{path:photo,sha256:sha}]});
 const observation=(code)=>({sku:code,found:true,description:'TEST DRUM',units:'EACH',price:11.5,onHand:20,booked:1,observedAt:now});
 const evidence={observations:[observation('TEST1'),observation('TEST2')],existing:{complete:true,identifiers:[]},controls:{complete:true,hiddenListings:[],hiddenImages:[]}};
 const provider=createWebsiteOnlyProvider({manifest:{items:[item('TEST1'),item('TEST2')]},readEvidence:async()=>evidence,origin:'https://example.test',now:()=>now});
 const before=structuredClone(evidence),all=await provider();assert.equal(all.rows.length,2);assert.deepEqual(evidence,before);
 assert.deepEqual((await provider({skus:['TEST2']})).rows.map(x=>x.sku),['TEST2']);
 assert.deepEqual((await provider({skus:['UNRELATED']})).rows,[]);
 evidence.controls.hiddenListings.push('TEST1');const hidden=await provider();assert.deepEqual(hidden.rows.map(x=>x.sku),['TEST2']);assert.equal(hidden.held.length,1);
 evidence.controls.hiddenListings=[];evidence.observations[0].observedAt=now-300001;const stale=await provider();assert.deepEqual(stale.rows.map(x=>x.sku),['TEST2']);
 evidence.controls.complete=false;await assert.rejects(provider,/evidence unavailable/);
});

test('provider supplies the real three integration functions without changing stock',async()=>{
 const now=Date.now(),sha='a'.repeat(64),path='/test/photo.jpg';
 const manifest={items:[{sku,description:'TEST DRUM',units:'EACH',category:'Test',mainPath:path,mainSha256:sha,photos:[{path,sha256:sha}]}]};
 const evidence={observations:[{sku,found:true,description:'TEST DRUM',units:'EACH',price:11.5,onHand:20,booked:1,observedAt:now}],existing:{complete:true,identifiers:[]},controls:{complete:true,hiddenListings:[],hiddenImages:[]}};
 const provider=createWebsiteOnlyProvider({manifest,readEvidence:async()=>evidence,origin:'https://example.test',now:()=>now});
 const oldUrl=process.env.STOCK_SQL_BRIDGE_URL,oldKey=process.env.STOCK_SQL_BRIDGE_KEY;
 process.env.STOCK_SQL_BRIDGE_URL='https://test.invalid';process.env.STOCK_SQL_BRIDGE_KEY='synthetic';
 try {
  const db=client(tables()),before=structuredClone(evidence);
  assert.equal((await loadLiveInstoreCatalogue(db,{websiteOnlyProvider:provider})).products[0].sku,sku);
  assert.equal((await readFreshInstoreStock(sku,{websiteOnlyProvider:provider,indexClient:db,fetchBridge})).qty,19);
  const [order]=await resolveInstorePrices([{qty:1,product:{sku,isExtendedRange:true}}],{websiteOnlyProvider:provider,index:db,fetchBridge});
  assert.equal(order.product.sku,sku);assert.equal(order.product.price,11.5);assert.deepEqual(evidence,before);
 } finally {if(oldUrl===undefined)delete process.env.STOCK_SQL_BRIDGE_URL;else process.env.STOCK_SQL_BRIDGE_URL=oldUrl;if(oldKey===undefined)delete process.env.STOCK_SQL_BRIDGE_KEY;else process.env.STOCK_SQL_BRIDGE_KEY=oldKey;}
});

test('real authenticated browse and stock handlers use the provider with read-only injected clients',async()=>{
 const now=Date.now(),sha='a'.repeat(64),path='/test/photo.jpg';
 const manifest={items:[{sku,description:'TEST DRUM',units:'EACH',category:'Test',mainPath:path,mainSha256:sha,photos:[{path,sha256:sha}]}]};
 const evidence={observations:[{sku,found:true,description:'TEST DRUM',units:'EACH',price:11.5,onHand:20,booked:1,observedAt:now}],existing:{complete:true,identifiers:[]},controls:{complete:true,hiddenListings:[],hiddenImages:[]}};
 let reads=0;const provider=createWebsiteOnlyProvider({manifest,readEvidence:async()=>{reads++;return evidence},origin:'https://example.test',now:()=>now});
 const db=client(tables());const response=()=>({code:0,body:null,setHeader(){},status(n){this.code=n;return this},json(x){this.body=x;return this}});
 const browse=createExtendedRangeHandler({authorize:async()=>({user:{id:'test'}}),getClient:()=>db,websiteOnlyProvider:provider});
 const deny=createExtendedRangeHandler({authorize:async(_req,res)=>{res.status(401).json({error:'denied'});return null},getClient:()=>{throw Error('must not read')},websiteOnlyProvider:provider});
 let res=response();await deny({method:'GET',query:{}},res);assert.equal(res.code,401);assert.equal(reads,0);
 res=response();await browse({method:'GET',headers:{host:'test-only.local'},query:{q:sku}},res);assert.equal(res.code,200);assert.equal(res.body.products[0].sku,sku);
 const oldUrl=process.env.STOCK_SQL_BRIDGE_URL,oldKey=process.env.STOCK_SQL_BRIDGE_KEY;
 process.env.STOCK_SQL_BRIDGE_URL='https://test.invalid';process.env.STOCK_SQL_BRIDGE_KEY='synthetic';
 try {
  const stock=createStockHandler({authenticate:async()=>({id:'test'}),approve:async()=>({user:{id:'test'}}),getClient:()=>db,websiteOnlyProvider:provider,fetchBridge});
  const deniedStock=createStockHandler({authenticate:async(_req,res)=>{res.status(401).json({error:'denied'});return null},getClient:()=>{throw Error('must not read')},websiteOnlyProvider:provider});
  const previousReads=reads;res=response();await deniedStock({method:'GET',headers:{host:'test-only.local'},query:{sku}},res);assert.equal(res.code,401);assert.equal(reads,previousReads);
  res=response();await stock({method:'GET',headers:{host:'test-only.local'},query:{sku}},res);assert.equal(res.code,200);assert.equal(res.body.qty,19);
  const [resolved]=await resolveAuthoritativePrices([{qty:1,product:{sku,isExtendedRange:true}}],{websiteOnlyProvider:provider,index:db,fetchBridge});assert.equal(resolved.product.price,11.5);
 } finally {if(oldUrl===undefined)delete process.env.STOCK_SQL_BRIDGE_URL;else process.env.STOCK_SQL_BRIDGE_URL=oldUrl;if(oldKey===undefined)delete process.env.STOCK_SQL_BRIDGE_KEY;else process.env.STOCK_SQL_BRIDGE_KEY=oldKey;}
});
