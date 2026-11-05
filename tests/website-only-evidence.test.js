import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogueControlsReader,createReadOnlyEvidenceReader,createWebsiteIdentifiersReader,createLiveReadOnlyEvidenceReader} from '../api/_website-only-evidence.js';
import {createWebsiteOnlyProvider} from '../api/_website-only-provider.js';
import {createRuntimeWebsiteOnlyProvider,websiteOnlyRequestOrigin} from '../api/_website-only-runtime.js';

function fakeClient(tables) {return {from(name){
 if(!(name in tables))throw Error('Unexpected table');
 const q={select(){return q},order(){return q},range(a,b){const data=tables[name];return Promise.resolve({data:data.slice(a,b+1),count:data.length,error:null})}};return q;
}};}
const controls=()=>({existing:{complete:true,identifiers:[]},controls:{complete:true,hiddenListings:[],hiddenImages:[]}});
test('catalogue and controls reader requires complete Website data and only reads permitted tables',async()=>{
 const tables={extended_range_items:[{sku:'EXISTING',barcode:'BC'}],website_stock:[{sku:'MAIN',barcode:'BC2'}],instore_listing_controls:[{sku:'HIDE',status:'hidden'}],instore_image_controls:[{sku:'PHOTO',status:'hidden'}]};
 const before=structuredClone(tables);const read=createCatalogueControlsReader({client:fakeClient(tables),readWebsiteIdentifiers:async()=>({complete:true,identifiers:['WEB']})});
 const evidence=await read();assert.deepEqual(evidence.existing.identifiers,['EXISTING','BC','MAIN','BC2','WEB']);assert.deepEqual(evidence.controls.hiddenListings,['HIDE']);assert.deepEqual(evidence.controls.hiddenImages,['PHOTO']);assert.deepEqual(tables,before);
 const bad=createCatalogueControlsReader({client:fakeClient(tables),readWebsiteIdentifiers:async()=>({complete:false,identifiers:[]})});await assert.rejects(bad(),/incomplete/);
});
test('bounded bridge reader preserves signed stock and fails only unavailable individual codes',async()=>{
 let active=0,peak=0;const reader=createReadOnlyEvidenceReader({readCatalogueAndControls:async()=>controls(),now:()=>1000,concurrency:2,readBridge:async sku=>{
 active++;peak=Math.max(active,peak);await Promise.resolve();active--;if(sku==='TEST-3')throw Error('unavailable');
 return {CODE:sku,DESCR:'TEST ITEM',UNITS:'EACH',ONHAND:-7,BOOKED:0,PRICE_A:10};}});
 const evidence=await reader({skus:['TEST-1','TEST-2','TEST-3']});assert.equal(evidence.observations.length,2);assert.deepEqual(evidence.failures,['TEST-3']);assert.ok(peak<=2);
 assert.equal(evidence.observations[0].onHand,-7);assert.equal(evidence.observations[0].price,11.5);
 await assert.rejects(()=>reader({skus:['TEST-1','TEST-1']}),/Invalid requested/);
});
test('provider and read-only reader fail closed on mismatched source and stale observations',async()=>{
 const sha='a'.repeat(64),path='/test/photo.jpg',item={sku:'TEST-1',description:'TEST ITEM',units:'EACH',category:'Test',mainPath:path,mainSha256:sha,photos:[{path,sha256:sha}]};
 const reader=createReadOnlyEvidenceReader({readCatalogueAndControls:async()=>controls(),now:()=>1000,readBridge:async()=>({CODE:'WRONG',DESCR:'TEST ITEM',UNITS:'EACH',ONHAND:2,BOOKED:0,PRICE_A:10})});
 const provider=createWebsiteOnlyProvider({manifest:{items:[item]},readEvidence:reader,origin:'https://example.test',now:()=>1000});
 const result=await provider();assert.equal(result.rows.length,0);assert.equal(result.held.length,1);
});

test('Website catalogue reader handles pagination and rejects changing counts or partial pages',async()=>{
 const values=Array.from({length:1505},(_,i)=>({code:'SKU'+String(i).padStart(4,'0')}));
 const result=await createWebsiteIdentifiersReader({client:fakeClient({products:values})})();assert.equal(result.identifiers.length,1505);
 const broken={from(){const q={select(){return q},order(){return q},range(){return Promise.resolve({data:[],count:5,error:null})}};return q;}};
 await assert.rejects(()=>createWebsiteIdentifiersReader({client:broken})(),/truncated/);
});

test('live-reader composition uses read-only sources and the existing read-only bridge protocol',async()=>{
 const tables={extended_range_items:[],website_stock:[],instore_listing_controls:[],instore_image_controls:[]};let requests=0;
 const reader=createLiveReadOnlyEvidenceReader({stockClient:fakeClient(tables),websiteClient:fakeClient({products:[]}),env:{STOCK_SQL_BRIDGE_URL:'https://test.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic'},now:()=>1000,transport:async(url,options)=>{
  requests++;assert.equal(url,'https://test.invalid/stmast');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{sku:'TEST-1'});
  return {ok:true,json:async()=>({row:{CODE:'TEST-1',DESCR:'TEST ITEM',UNITS:'EACH',PRICE_A:10,ONHAND:-7,BOOKED:0}})};
 }});
 const result=await reader({skus:['TEST-1']});assert.equal(requests,1);assert.equal(result.observations[0].onHand,-7);assert.equal(result.observations[0].price,11.5);assert.deepEqual(result.failures,[]);
});

test('source cache keeps its original observation time, expires and rereads controls',async()=>{
 let time=1000,bridgeCalls=0,controlCalls=0;
 const read=createReadOnlyEvidenceReader({now:()=>time,cacheMs:50,readCatalogueAndControls:async()=>{controlCalls++;return controls()},readBridge:async sku=>{
   bridgeCalls++;return {CODE:sku,DESCR:'TEST ITEM',UNITS:'EACH',PRICE_A:10,ONHAND:2,BOOKED:0};
 }});
 const first=await read({skus:['TEST-1']});time+=40;
 const cached=await read({skus:['TEST-1']});assert.equal(bridgeCalls,1);assert.equal(controlCalls,2);
 assert.equal(cached.observations[0].observedAt,first.observations[0].observedAt);
 time+=11;await read({skus:['TEST-1']});assert.equal(bridgeCalls,2);assert.equal(controlCalls,3);
});

test('an elapsed deadline holds unread items without inventing stock',async()=>{
 let clock=0;
 const read=createReadOnlyEvidenceReader({deadlineMs:1,wallClock:()=>clock,concurrency:1,readCatalogueAndControls:async()=>controls(),readBridge:async sku=>{
  clock=2;return {CODE:sku,DESCR:'TEST',UNITS:'EACH',PRICE_A:10,ONHAND:1,BOOKED:0};
 }});
 const result=await read({skus:['TEST-1','TEST-2']});
 assert.deepEqual(result.observations.map(row=>row.sku),['TEST-1']);assert.deepEqual(result.failures,['TEST-2']);
});

test('temporary source failures receive one bounded retry, never fabricated data',async()=>{
 const attempts=new Map();
 const read=createReadOnlyEvidenceReader({retryOnce:true,readCatalogueAndControls:async()=>controls(),readBridge:async sku=>{
   attempts.set(sku,(attempts.get(sku)||0)+1);
   if(sku==='TEST-FAIL'||attempts.get(sku)===1)throw Error('unavailable');
   return {CODE:sku,DESCR:'TEST',UNITS:'EACH',PRICE_A:10,ONHAND:0,BOOKED:0};
 }});
 const result=await read({skus:['TEST-RECOVER','TEST-FAIL']});
 assert.deepEqual(result.observations.map(x=>x.sku),['TEST-RECOVER']);
 assert.deepEqual(result.failures,['TEST-FAIL']);
 assert.equal(attempts.get('TEST-RECOVER'),2);assert.equal(attempts.get('TEST-FAIL'),2);
});

test('runtime provider reads the real batch manifest through read-only adapters',async()=>{
 const tables={extended_range_items:[],website_stock:[],instore_listing_controls:[],instore_image_controls:[]};
 const runtime=createRuntimeWebsiteOnlyProvider({stockClient:fakeClient(tables),websiteClient:fakeClient({products:[]}),
 env:{STOCK_SQL_BRIDGE_URL:'https://test.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic',VERCEL_ENV:'preview',VERCEL_URL:'protoportal-main-test-proto-team.vercel.app'},now:()=>1000,
 transport:async(url,options)=>{assert.equal(url,'https://test.invalid/stmast');assert.equal(options.method,'POST');
 return {ok:true,json:async()=>({row:{CODE:'A-BRA1003',DESCR:'BRASS BUDDAH RECLINING 12CM',UNITS:'EACH',PRICE_A:91.3,ONHAND:1,BOOKED:0}})};}});
 const found=await runtime({skus:['A-BRA1003']});assert.equal(found.rows.length,1);
 assert.equal(found.rows[0].price,105);assert.equal(found.rows[0].available_stock,1);
 assert.match(found.rows[0].image_url,/^https:\/\/protoportal-main-test-proto-team\.vercel\.app\/product-options\/website-only-163\//);
 assert.deepEqual((await runtime({skus:['L-TON1104','KDIS1001']})).rows,[]);
});

test('production staging uses only its own trusted asset host',async()=>{
 const env={VERCEL_ENV:'production',VERCEL_URL:'protoportal-main-test-proto-team.vercel.app'};
 assert.equal(websiteOnlyRequestOrigin({headers:{host:env.VERCEL_URL}},env),'https://'+env.VERCEL_URL);
 assert.equal(websiteOnlyRequestOrigin({headers:{host:'www.proto.co.za'}},env),'https://www.proto.co.za');
 assert.equal(websiteOnlyRequestOrigin({headers:{host:'attacker.example'}},env),'https://www.proto.co.za');
 assert.equal(websiteOnlyRequestOrigin({headers:{host:'protoportal-main-other-proto-team.vercel.app'}},env),'https://www.proto.co.za');
 const tables={extended_range_items:[],website_stock:[],instore_listing_controls:[],instore_image_controls:[]};
 const runtime=createRuntimeWebsiteOnlyProvider({stockClient:fakeClient(tables),websiteClient:fakeClient({products:[]}),
 env:{...env,STOCK_SQL_BRIDGE_URL:'https://test.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic'},now:()=>1000,
 transport:async()=>({ok:true,json:async()=>({row:{CODE:'A-BRA1003',DESCR:'BRASS BUDDAH RECLINING 12CM',UNITS:'EACH',PRICE_A:91.3,ONHAND:1,BOOKED:0}})})});
 const staged=await runtime({skus:['A-BRA1003'],origin:'https://'+env.VERCEL_URL});
 const live=await runtime({skus:['A-BRA1003'],origin:'https://www.proto.co.za'});
 const forged=await runtime({skus:['A-BRA1003'],origin:'https://attacker.example'});
 assert.ok(staged.rows[0].image_url.startsWith('https://'+env.VERCEL_URL+'/'));
 assert.ok(live.rows[0].image_url.startsWith('https://www.proto.co.za/'));
 assert.ok(forged.rows[0].image_url.startsWith('https://www.proto.co.za/'));
});
