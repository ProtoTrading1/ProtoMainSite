import test from 'node:test';
import assert from 'node:assert/strict';
import {createExtendedRangeHandler} from '../api/extended-range.js';
import {buildCatalogueRows,controlsFingerprint} from '../api/_instore-catalogue.js';
const main='https://images.example.test/secondary-main.jpg',extra='https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/instore-secondary-v1/10000000-0000-4000-8000-000000000001/'+'a'.repeat(64)+'.png';
const product={id:'8622930082',sku:'8622930082',code:'8622930082',name:'Secondary photo fixture',title:'Secondary photo fixture',price:27.5,stockQty:35,stockOnHand:35,unitsOfIssue:'EACH',image:main,images:[main],isExtendedRange:true,instoreSourceIdentity:'c'.repeat(64)};
const response=()=>({setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
function database({generation='42',galleryGeneration=generation,available=true}={}){
 const calls=[],tables={instore_catalogue:buildCatalogueRows([product]),instore_catalogue_state:[{id:true,refreshed_at:new Date().toISOString(),product_count:1,tiles:[],controls_fingerprint:controlsFingerprint(new Map(),new Map(),generation)}]};
 const db={calls,rpc(name,body){calls.push({name,body});
  if(name==='instore_website_content_read_v1')return Promise.resolve({data:{generation,overrides:[]}});
  if(name==='instore_secondary_gallery_read_v1')return {abortSignal:async()=>available?{data:{protocol:'proto.instore-secondary-gallery.v1',generation:galleryGeneration,galleries:[{sku:product.sku,sourceIdentitySHA:product.instoreSourceIdentity,mainUrl:main,baseImageUrls:[main],imageUrls:[main,extra],managedImageUrls:[extra],revision:1,operationId:'10000000-0000-4000-8000-000000000001'}]}}:{error:{message:'unavailable'}}};
  return Promise.resolve({error:{message:'optional view unavailable'}});
 },from(table){const filters=[];let single=false,start=0,end=Infinity;const q={select(){return q;},eq(key,value){filters.push(row=>row[key]===value);return q;},in(key,values){filters.push(row=>values.includes(row[key]));return q;},like(key,value){filters.push(row=>String(row[key]||'').includes(value.replaceAll('%','')));return q;},order(){return q;},range(a,b){start=a;end=b;return q;},maybeSingle(){single=true;return q;},then(resolve){const rows=(tables[table]||[]).filter(row=>filters.every(filter=>filter(row)));return Promise.resolve({data:single?rows[0]||null:rows.slice(start,end+1),count:rows.length,error:null}).then(resolve);}};return q;}};return db;
}
test('actual authenticated full-collection route overlays fresh secondary gallery on both stored result and catalogue',async()=>{
 const db=database(),res=response();await createExtendedRangeHandler({authorize:async()=>true,getClient:()=>db})({method:'GET',headers:{host:'www.proto.co.za'},query:{catalogue:'1'}},res);
 assert.equal(res.code,200);for(const rows of [res.body.products,res.body.catalogue])assert.deepEqual(rows,[{...product,images:[main,extra]}]);
 assert.equal(res.body.contentGeneration,'42');assert.equal(db.calls.filter(call=>call.name==='instore_secondary_gallery_read_v1').length,1);
});
test('reader failure or generation race preserves the listing and main without authorizing stale secondary photos',async()=>{
 for(const options of [{available:false},{galleryGeneration:'43'}]){const db=database(options),res=response();await createExtendedRangeHandler({authorize:async()=>true,getClient:()=>db})({method:'GET',headers:{host:'www.proto.co.za'},query:{catalogue:'1'}},res);assert.equal(res.code,200);assert.deepEqual(res.body.products,[product]);}
});
test('denied customer makes zero catalogue, secondary-gallery or source requests',async()=>{
 let reads=0;await createExtendedRangeHandler({authorize:async()=>false,getClient:()=>{reads++;throw Error('Unexpected client');}})({method:'GET',headers:{host:'www.proto.co.za'},query:{}},response());assert.equal(reads,0);
});

test('one shared lookup keeps products and catalogue coherent when a second independent read would fail',async()=>{
 const db=database(),rpc=db.rpc;let galleryReads=0;
 db.rpc=(name,body)=>{if(name==='instore_secondary_gallery_read_v1'&&++galleryReads>1)return {abortSignal:async()=>({error:{message:'second read unavailable'}})};return rpc(name,body);};
 const res=response();await createExtendedRangeHandler({authorize:async()=>true,getClient:()=>db})({method:'GET',headers:{host:'www.proto.co.za'},query:{catalogue:'1'}},res);
 assert.equal(res.code,200);assert.deepEqual(res.body.products,res.body.catalogue);
 assert.deepEqual(res.body.products,[{...product,images:[main,extra]}]);assert.equal(galleryReads,1);
});
