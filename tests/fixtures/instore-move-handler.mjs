import {mock} from 'node:test';
import assert from 'node:assert/strict';
const [enabled,path,deny]=process.argv.slice(2);
if(enabled==='on')process.env.PROTO_ARCHIVE_MOVE_GALLERIES_ENABLED='1';else delete process.env.PROTO_ARCHIVE_MOVE_GALLERIES_ENABLED;
globalThis.fetch=()=>{throw Error('External IO forbidden in fixture');};
const urls=Array.from({length:8},(_,n)=>`https://images.example.test/synthetic-${n}.jpg`),sku='9999910000001';
const raw={sku,barcode:sku,title:'Synthetic fixture',price:12.5,stock_qty:20,available_stock:20,units_of_issue:'EACH',category:'Synthetic category',image_url_one:urls[0],image_url_two:urls[1],image_url_three:urls[2],image_url_four:urls[3],moved_from:'instore',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z'};
const original=JSON.stringify(raw),queries=[],rpcCalls=[],clients=[];
const client={from(table){assert.ok(['website_stock','products'].includes(table));let columns;
 const q={select(value){columns=value;queries.push({table,columns});if(enabled!=='on')assert.ok(!value.includes('moved_from'),'disabled queries must support the old schema');return q;},range(){return q;},order(){return q;},limit(){return q;},eq(){return q;},in(){return q;},or(){return q;},then(yes,no){return Promise.resolve({data:table==='products'?[]:columns==='updated_at'?[{updated_at:raw.updated_at}]:[raw],count:1}).then(yes,no);}};return q;},rpc(name,body){rpcCalls.push({name,body});assert.equal(name,'loader_archive_listing_move_galleries_v1');assert.deepEqual(body,{p_body:{skus:[sku]}});return {abortSignal:async()=>({data:[{sku,currentImage:urls[0],imageUrls:urls}]})};}};
mock.module('../../lib/stock-supabase.mjs',{namedExports:{createStockClient:options=>{clients.push(options||{});return client;}}});
mock.module('../../api/_auth.js',{namedExports:{requireApprovedCustomer:async(req,res)=>{if(deny==='denied'){res.status(401).json({error:'denied'});return null;}return{id:'synthetic-approved'};}}});
mock.module('../../api/_site-config.js',{namedExports:{readSiteConfigJson:async name=>name==='taxonomy/categories.json'?[{id:'synthetic-category',label:'Synthetic category',children:[]}]:null}});
mock.module('../../api/_placements.js',{namedExports:{loadPlacementMapIfEnabled:async()=>null,skusMatchingBrowsePath:()=>[]}});
mock.module('../../api/_groups.js',{namedExports:{loadGroupInfoMapIfEnabled:async()=>null}});
mock.module('../../api/_product-availability.js',{namedExports:{availabilityForRow:row=>({state:'in_stock',canOrder:true,stockQty:row.stock_qty}),loadIncomingAvailabilityMap:async()=>new Map(),loadIncomingAvailabilityVersion:async()=>({newest:'0',count:0})}});
const {default:handler}=await import('../../api/products.js');
const query=path==='full'?{}:path==='skus'?{skus:sku}:path==='browse'?{browsePath:'synthetic-category'}:{identifier:'9999910000001'};
function response(){return{headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(value){this.body=value;return this;},end(){return this;}};}
const res=response();await handler({method:'GET',query,headers:{}},res);
if(deny==='denied'){assert.equal(res.code,401);assert.equal(clients.length,0);assert.equal(queries.length,0);assert.equal(rpcCalls.length,0);}
else{assert.equal(res.code,200);assert.equal(res.body.length,1);const p=res.body[0];assert.equal(p.sku,sku);assert.equal(p.price,12.5);assert.equal(p.stockQty,20);assert.equal(p.stockOnHand,20);assert.equal(p.unitsOfIssue,'EACH');assert.equal(p.category,'synthetic-category');assert.equal(JSON.stringify(raw),original);assert.deepEqual(p.images,enabled==='on'?urls:urls.slice(0,4));assert.equal(rpcCalls.length,enabled==='on'?1:0);assert.equal(clients.filter(c=>c.legacyServiceRole===true).length,enabled==='on'?1:0);
 if(enabled!=='on')assert.ok(!Object.hasOwn(p,'hasPreservedInstoreGallery'));
 if(path==='full'){assert.equal(res.headers.ETag.includes('moves-v1'),enabled==='on');const calls=rpcCalls.length;const cached=response();await handler({method:'GET',query,headers:{'if-none-match':res.headers.ETag}},cached);assert.equal(cached.code,304);assert.equal(rpcCalls.length,calls);}}
console.log(JSON.stringify({enabled,path,denied:deny==='denied',status:res.code,rpcCalls:rpcCalls.length,unchanged:JSON.stringify(raw)===original}));
