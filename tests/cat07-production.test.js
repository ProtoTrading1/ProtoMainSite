import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReceipt} from '../e2e/fixtures/cat07-server-data.mjs';
import {cat07ManifestHash} from '../lib/cat07-order-preview.mjs';
import {readCompletedCat07Receipt,verifyCat07Row} from '../api/_cat07-family.js';
import {loadLiveInstoreCatalogue,createExtendedRangeHandler,buildExtendedRangeProducts} from '../api/extended-range.js';
import {readFreshInstoreStock,createStockHandler} from '../api/stock.js';
import {resolveAuthoritativePrices,resolveInstorePrices,resolveInstoreOrderLine,buildOrderEmailHtml} from '../api/send-order.js';
import {parseCartMutation,cartPayload} from '../api/account-cart.js';
import {CAT07_HISTORICAL_ALIASES} from '../lib/cat07-customer-gallery.mjs';
import {instorePage} from '../lib/instore-page.mjs';
import sqlFixture from './fixtures/cat07-sql-receipt.json' with {type:'json'};
const sku='8640000274',receipt=()=>structuredClone(fixtureReceipt),env={STOCK_SQL_BRIDGE_URL:'https://cat07-bridge.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic-noncredential'};
const base=()=>({sku,barcode:sku,title:'CHRISTMAS HANGING ORNAMENT',original_description:'XMAS DECO HANGING ORNAMENT ASST',price:6,available_stock:6,minimum_stock:1,image_source:'nutstore',image_source_key:'cat07-family-v1:'+fixtureReceipt.manifestHash,image_url:fixtureReceipt.views[0].image.url,image_review_status:'verified',visibility_status:'search_only',is_active:true,supplier_name:'POSITILL',category:'Party & Events'});
const bridge=(qty=6)=>({CODE:sku,DESCR:'XMAS DECO HANGING ORNAMENT ASST',UNITS:'EACH',PRICE_A:5.22,ONHAND:qty,BOOKED:0});
const line=(style=1,qty=1)=>({qty,preference:fixtureReceipt.views[style].label,product:{sku,code:'FORGED',barcode:'FORGED',price:0.01,image:'https://forged.invalid/a.jpg',unitsOfIssue:'PACK 100',cat07Family:{status:'complete'}}});
function client({rows=[base()],main=[],listing=[],image=[],readReceipt=receipt,rpcFailure=false}={}){
 return {calls:[],from(table){
  const tables={extended_range_items:rows,website_stock:main,instore_listing_controls:listing,instore_image_controls:image};assert.ok(Object.hasOwn(tables,table),'Unexpected table/write '+table);
  let filters=[],columns='*',limit=null;
  const data=()=>{let values=tables[table].filter(r=>filters.every(f=>f(r)));if(limit!==null)values=values.slice(0,limit);return values.map(r=>columns==='*'?structuredClone(r):Object.fromEntries(columns.split(',').map(c=>[c.trim(),r[c.trim()]])));};
  const q={select(value){columns=value;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},gt(k,v){filters.push(r=>r[k]>v);return q;},like(k,v){assert.equal(v,'https://%');filters.push(r=>String(r[k]).startsWith('https://'));return q;},order(){return q;},or(expression){const clauses=expression.split(',').map(c=>c.split('.eq.'));filters.push(r=>clauses.some(([k,v])=>r[k]===v));return q;},limit(n){limit=n;return q;},range(a,b){const all=data();return Promise.resolve({data:all.slice(a,b+1),count:all.length,error:null});},then(resolve,reject){return Promise.resolve({data:data(),error:null}).then(resolve,reject);}};return q;
 },async rpc(name,args){this.calls.push({name,args});if(name==='instore_website_content_read_v1')return {data:{generation:'0',overrides:[]},error:null};if(name==='arrived_stock_receipts_v1'){assert.equal(args.p_action,'states');return {data:[],error:null};}assert.equal(name,'loader_cat07_family_publication_read_v1');assert.deepEqual(args,{p_body:{sku,destination:'instore'}});return {data:rpcFailure?null:readReceipt(),error:rpcFailure?Error('offline'):null};}};
}
const response=()=>({statusCode:0,headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=JSON.parse(JSON.stringify(v));return this;}});
const transport=row=>async(url,options)=>{assert.equal(url,env.STOCK_SQL_BRIDGE_URL+'/stmast');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{sku});return new Response(JSON.stringify({row}),{headers:{'content-type':'application/json'}});};

test('reader admits only completed immutable receipts bound to the actual canonical row',async()=>{
 const good=await readCompletedCat07Receipt(client(),base());assert.equal(good.manifestHash,fixtureReceipt.manifestHash);
 for(const changed of [{barcode:'OTHER'},{image_source_key:'archive-publication-v1:'+fixtureReceipt.manifestHash},{image_url:fixtureReceipt.views[1].image.url},{is_active:false},{minimum_stock:10},{visibility_status:'hidden'}])await assert.rejects(()=>readCompletedCat07Receipt(client(),{...base(),...changed}));
 for(const bad of [null,{...receipt(),status:'pending'},{...receipt(),manifestHash:'0'.repeat(64)},{...receipt(),mainViewId:'style-4'}])await assert.rejects(()=>readCompletedCat07Receipt(client({readReceipt:()=>bad}),base()));
 await assert.rejects(()=>readCompletedCat07Receipt(client({rpcFailure:true}),base()));
});
test('actual backend SQL completed-receipt fixture matches the Node canonical digest and real reader contract',async()=>{
 assert.match(sqlFixture.evidence,/PGlite-only/);const receipt=sqlFixture.receipt;
 assert.equal(cat07ManifestHash(receipt),receipt.manifestHash);
 const row={...base(),image_source_key:'cat07-family-v1:'+receipt.manifestHash,image_url:receipt.views[0].image.url};
 const verified=await verifyCat07Row(row,{client:client({rows:[row],readReceipt:()=>receipt}),read:async()=>bridge()});const [product]=buildExtendedRangeProducts([verified]);assert.equal(product.images.length,9);assert.equal(product.stockQty,6);assert.equal(product.cat07Family.receiptId,receipt.receiptId);
});
test('raw or JSON-forged rows never pass the family feed; fresh receipt/source alone creates nine views',async()=>{
 assert.equal(buildExtendedRangeProducts([{...base(),available_stock:100,cat07Family:fixtureReceipt}]).length,0);
 const verified=await verifyCat07Row(base(),{client:client(),read:async()=>bridge()});const [p]=buildExtendedRangeProducts([verified]);
 assert.equal(p.stockQty,6);assert.equal(p.images.length,9);assert.equal(p.image,fixtureReceipt.views[0].image.url);assert.equal(p.cat07Family.manifestHash,fixtureReceipt.manifestHash);assert.equal(p.price,6);
 assert.equal(buildExtendedRangeProducts([JSON.parse(JSON.stringify(verified))]).length,0);
 for(const changed of [{available_stock:100},{price:0.01},{image_url:fixtureReceipt.views[1].image.url}])assert.equal(buildExtendedRangeProducts([{...verified,...changed}]).length,0);
});
test('authenticated browse/exact/style search attach the real reader contract after fresh source without alias duplication',async()=>{
 const originalFetch=globalThis.fetch,saved=Object.fromEntries(['STOCK_SQL_BRIDGE_URL','STOCK_SQL_BRIDGE_KEY','INSTORE_ARRIVED_STOCK_ENABLED'].map(k=>[k,process.env[k]]));
 try{Object.assign(process.env,env,{INSTORE_ARRIVED_STOCK_ENABLED:'1'});globalThis.fetch=transport(bridge());
  const db=client(),live=await loadLiveInstoreCatalogue(db,{websiteOnlyRows:[]});assert.equal(live.products.length,1);assert.equal(live.products[0].images.length,9);assert.equal(live.products[0].stockQty,6);
  const handler=createExtendedRangeHandler({authorize:async()=>({user:{id:'synthetic'}}),getClient:()=>db});
  for(const query of [{q:sku,exact:'1'},{q:'gingerbread',catalogue:'1'}]){const res=response();await handler({method:'GET',headers:{host:'www.proto.co.za'},query},res);assert.equal(res.statusCode,200);assert.equal(res.body.products.length,1);assert.equal(res.body.products[0].sku,sku);assert.equal(res.body.products[0].stockQty,6);}
  for(const db of [client({main:[{sku:'OTHER',barcode:sku}]}),client({listing:[{sku,status:'hidden'}]}),client({readReceipt:()=>null})])assert.equal((await loadLiveInstoreCatalogue(db,{exactSku:sku})).products.length,0);
  const neutral=(await loadLiveInstoreCatalogue(client({image:[{sku,status:'hidden'}]}),{exactSku:sku})).products[0];assert.equal(neutral.image,'');assert.deepEqual(neutral.images,[]);
  globalThis.fetch=transport(bridge(0));assert.equal((await loadLiveInstoreCatalogue(client(),{exactSku:sku})).products.length,0);
  globalThis.fetch=async()=>{throw Error('offline');};assert.equal((await loadLiveInstoreCatalogue(client(),{exactSku:sku})).products.length,0);
 }finally{globalThis.fetch=originalFetch;for(const [k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
test('authenticated stock endpoint requires current receipt and returns exact fresh EACH balance/price',async()=>{
 for(const qty of [6,2,0,-1]){const stock=await readFreshInstoreStock(sku,{indexClient:client(),fetchBridge:transport(bridge(qty)),bridgeEnv:env});assert.equal(stock.qty,qty);assert.equal(stock.price,6);assert.equal(stock.unitsOfIssue,'EACH');assert.equal(stock.availability.canOrder,qty>0);}
 const handler=createStockHandler({authenticate:async()=>({id:'synthetic'}),approve:async()=>true,getClient:()=>client(),fetchBridge:transport(bridge()),bridgeEnv:env});const res=response();await handler({method:'GET',headers:{},query:{sku}},res);assert.equal(res.statusCode,200);assert.equal(res.body.qty,6);
 await assert.rejects(()=>readFreshInstoreStock(sku,{indexClient:client({readReceipt:()=>null}),fetchBridge:transport(bridge()),bridgeEnv:env}));
 assert.equal(await readFreshInstoreStock(sku,{indexClient:client({listing:[{sku,status:'hidden'}]}),fetchBridge:transport(bridge()),bridgeEnv:env}),null);
});
test('authoritative checkout classifies forged flags, sums all styles and rebuilds labels/images/code/price/unit',async()=>{
 const items=[line(2,4),line(3,2)],resolved=await resolveAuthoritativePrices(items,{index:client(),fetchBridge:transport(bridge()),bridgeEnv:env});
 assert.deepEqual(resolved.map(x=>x.qty),[4,2]);for(let i=0;i<2;i++){assert.equal(resolved[i].product.sku,sku);assert.equal(resolved[i].product.code,sku);assert.equal(resolved[i].product.price,6);assert.equal(resolved[i].product.unitsOfIssue,'EACH');assert.equal(resolved[i].product.image,fixtureReceipt.views[i+2].image.url);}
 const html=buildOrderEmailHtml({items:resolved,totals:{subtotal:36,total:36}});assert.ok(html.includes('R36.00'));assert.ok(!html.includes('forged.invalid'));
 await assert.rejects(()=>resolveAuthoritativePrices([line(2,4),line(3,3)],{index:client(),fetchBridge:transport(bridge()),bridgeEnv:env}),/Only 6/);
 await assert.rejects(()=>resolveInstorePrices([line(2,4),line(2,3)],{index:client(),fetchBridge:transport(bridge()),bridgeEnv:env}),/Only 6/);
 await assert.rejects(()=>resolveInstorePrices(items,{index:client(),fetchBridge:transport(bridge(3)),bridgeEnv:env}),/Only 3/);
 const forced=await resolveAuthoritativePrices(items.map(item=>({...item,product:{...item.product,isExtendedRange:false}})),{classify:async()=>new Set(),index:client(),fetchBridge:transport(bridge()),bridgeEnv:env});assert.equal(forced.length,2);assert.equal(forced[0].product.image,fixtureReceipt.views[2].image.url);
 await assert.rejects(()=>resolveAuthoritativePrices([line()],{classify:async()=>new Set(),index:client({readReceipt:()=>null}),fetchBridge:transport(bridge()),bridgeEnv:env}));
 await assert.rejects(()=>resolveAuthoritativePrices([line()],{classify:async()=>new Set(),index:client({main:[{sku,barcode:sku}]}),fetchBridge:transport(bridge()),bridgeEnv:env}));
 assert.throws(()=>resolveInstoreOrderLine(line(),{indexRow:base(),bridgeRow:bridge()}),/verified together/);
});
test('checkout holds receipt/source/control/pack failures without cached price or stock fallback',async()=>{
 for(const db of [client({readReceipt:()=>null}),client({rpcFailure:true}),client({listing:[{sku,status:'hidden'}]}),client({main:[{sku:'OTHER',barcode:sku}]})])await assert.rejects(()=>resolveInstorePrices([line()],{index:db,fetchBridge:transport(bridge()),bridgeEnv:env}));
 for(const row of [bridge(0),bridge(-1),{...bridge(),UNITS:'PACK 10'},{...bridge(),ONHAND:null},{...bridge(),PRICE_A:0},{...bridge(),CODE:'OTHER'}])await assert.rejects(()=>resolveInstorePrices([line()],{index:client(),fetchBridge:transport(row),bridgeEnv:env}));
 await assert.rejects(()=>resolveInstorePrices([line()],{index:client(),fetchBridge:async()=>{throw Error('offline');},bridgeEnv:env}));
 await assert.rejects(()=>resolveInstorePrices([{...line(),preference:'Saved family reference overview'}],{index:client(),fetchBridge:transport(bridge()),bridgeEnv:env}));
});
test('account basket round trip keeps two style lines/photos under one canonical identity; no browser receipt is authority',()=>{
 const now=1800000000000,items=[line(2,4),line(3,2)].map((l,i)=>({...l,product:{...l.product,image:fixtureReceipt.views[i+2].image.url,price:6,unitsOfIssue:'EACH'}}));
 const parsed=parseCartMutation({mode:'save',revision:1,activityAt:now,items},{now}),saved=cartPayload({items:parsed.items,revision:2,activity_at:now});assert.equal(saved.items.length,2);assert.notEqual(saved.items[0].preference,saved.items[1].preference);assert.notEqual(saved.items[0].product.image,saved.items[1].product.image);assert.equal(new Set(saved.items.map(i=>i.product.sku)).size,1);
 assert.equal(cat07ManifestHash(fixtureReceipt),fixtureReceipt.manifestHash);
});
test('real HTTP authentication precedes every CAT07 database/receipt/source read',async()=>{
 let reads=0;const deny=async(_req,res)=>{res.status(401).json({error:'denied'});return null;},getClient=()=>{reads++;throw Error('Read before auth');};
 const stock=createStockHandler({authenticate:deny,getClient}),browse=createExtendedRangeHandler({authorize:deny,getClient});
 for(const handler of [stock,browse]){const res=response();await handler({method:'GET',headers:{},query:{sku,q:sku,exact:'1'}},res);assert.equal(res.statusCode,401);}
 assert.equal(reads,0);
});
test('all seven historical aliases search the one completed family but can never order separate balances',async()=>{
 const verified=await verifyCat07Row(base(),{client:client(),read:async()=>bridge()}),products=buildExtendedRangeProducts([verified]);
 for(const alias of CAT07_HISTORICAL_ALIASES){
  assert.deepEqual(instorePage(products,{query:alias,page:1,pageSize:24}).products.map(p=>p.sku),[sku]);
  for(const isExtendedRange of [false,true]){
   const forged={...line(),product:{...line().product,sku:alias,code:sku,barcode:sku,isExtendedRange}};
   await assert.rejects(()=>resolveAuthoritativePrices([forged],{index:client(),fetchBridge:async()=>{throw Error('Alias source lookup must not happen');},bridgeEnv:env}),/not separate stock/);
   await assert.rejects(()=>resolveInstorePrices([forged],{index:client(),fetchBridge:async()=>{throw Error('Alias source lookup must not happen');},bridgeEnv:env}),/not separate stock/);
  }
 }
 assert.equal(CAT07_HISTORICAL_ALIASES.length,7);
 const hidden={...products[0],imageStatus:'hidden'};for(const alias of CAT07_HISTORICAL_ALIASES)assert.equal(instorePage([hidden],{query:alias,page:1,pageSize:24}).products.length,0);
});
