import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyInstoreWebsiteContent,refreshInstoreBasketText,validateInstoreWebsiteContent,customerProductDescription} from '../lib/instore-website-content.mjs';
import {discoveryGroup,matchesInstoreSearch} from '../lib/instore-discovery.mjs';
import {buildCatalogueRows,controlsFingerprint} from '../api/_instore-catalogue.js';
import {serveStoredCatalogue,createExtendedRangeHandler} from '../api/extended-range.js';
import {resolveInstorePrices} from '../api/send-order.js';
import {instoreContentSourceIdentity} from '../api/_instore-website-content.js';
const product={id:'SYNTHETIC-1',sku:'SYNTHETIC-1',code:'SOURCE-BARCODE',barcode:'SOURCE-BARCODE',name:'BRACELET',title:'BRACELET',description:'Source details',originalDescription:'BRACELET',price:32,stockQty:18,unitsOfIssue:'EACH',image:'https://images.example.test/main.jpg',images:['main','other'],isExtendedRange:true};
product.instoreSourceIdentity=instoreContentSourceIdentity({sku:product.sku,barcode:product.barcode});
const content={generation:'1',overrides:[{sku:product.sku,websiteTitle:'Silky summer bracelet',websiteDescription:'A bright website description',revision:'1',sourceIdentity:product.instoreSourceIdentity}]};
test('website text overlay preserves every operational identity, main and shared balance without mutating cached canonical objects',()=>{
 const before=structuredClone(product),changed=applyInstoreWebsiteContent([product],content)[0];
 assert.equal(changed.name,'Silky summer bracelet');assert.equal(changed.description,'A bright website description');
 for(const key of ['id','sku','code','barcode','price','stockQty','unitsOfIssue','image','images','originalDescription'])assert.deepEqual(changed[key],before[key]);
 assert.deepEqual(product,before);assert.equal(discoveryGroup(changed),discoveryGroup(product));assert.ok(matchesInstoreSearch(changed,'silky'));assert.ok(matchesInstoreSearch(changed,'SOURCE-BARCODE'));
 assert.deepEqual(buildCatalogueRows([product])[0].payload,before);
});
test('restore uses source wording and a source rebuild cannot erase the independently read override',()=>{
 const refreshed={...product,name:'Fresh source',title:'Fresh source',price:45,stockQty:25};
 assert.equal(applyInstoreWebsiteContent([refreshed],content)[0].name,'Silky summer bracelet');
 assert.equal(applyInstoreWebsiteContent([refreshed],{generation:'2',overrides:[]})[0].name,'Fresh source');
});
test('actual product-detail description reader shows website text while preserving other catalogue descriptions',()=>{
 const edited=applyInstoreWebsiteContent([product],content)[0];assert.equal(customerProductDescription(edited),'A bright website description');
 assert.equal(customerProductDescription({...edited,isExtendedRange:false}),'BRACELET');
});
test('metadata cannot admit an absent/ineligible SKU or alter basket identity/preferences/amounts',()=>{
 assert.deepEqual(applyInstoreWebsiteContent([],content),[]);
 const items=[{qty:3,preference:'Blue',product:{...product,price:12,image:'selected-colour.jpg'}}],display=refreshInstoreBasketText(items,applyInstoreWebsiteContent([product],content));
 assert.equal(display[0].product.name,'Silky summer bracelet');assert.equal(items[0].product.name,'BRACELET');
 assert.equal(display[0].qty,3);assert.equal(display[0].preference,'Blue');assert.equal(display[0].product.price,12);assert.equal(display[0].product.image,'selected-colour.jpg');assert.equal(display[0].product.barcode,product.barcode);
});
test('basket text is not copied onto reused or legacy unbound saved identities',()=>{
 const changed=applyInstoreWebsiteContent([product],content),old={...product,instoreSourceIdentity:'b'.repeat(64),barcode:'OLD'};
 const items=[{qty:2,product:old}];assert.equal(refreshInstoreBasketText(items,changed),items);
 const legacy={...product};delete legacy.instoreSourceIdentity;const saved=[{qty:2,product:legacy}];assert.equal(refreshInstoreBasketText(saved,changed),saved);
});
test('malformed/duplicate metadata cannot silently replace a product',()=>{
 assert.throws(()=>validateInstoreWebsiteContent({...content,overrides:[...content.overrides,...content.overrides]}));
 assert.throws(()=>validateInstoreWebsiteContent({...content,generation:1}));
 assert.throws(()=>validateInstoreWebsiteContent({...content,overrides:[{...content.overrides[0],websiteTitle:'<script>bad</script>'}]}));
});
test('an override for a reused source identity cannot label an older cached product with the same SKU',()=>{
 const old={...product,barcode:'OLD',instoreSourceIdentity:instoreContentSourceIdentity({sku:product.sku,barcode:'OLD'})};
 assert.equal(applyInstoreWebsiteContent([old],content)[0],old);assert.equal(old.name,'BRACELET');
 const legacy={...product};delete legacy.instoreSourceIdentity;assert.equal(applyInstoreWebsiteContent([legacy],content)[0],legacy);
});
test('matches the database-verified raw identity vectors without trimming or merging null and empty values',()=>{
 const vectors=JSON.parse(readFileSync(new URL('./fixtures/instore-content-source-identities.json',import.meta.url),'utf8'));
 for(const value of vectors)assert.equal(instoreContentSourceIdentity(value.input),value.expected);
});
function client(tables,metadata=content){return {rpc:async(name)=>name==='instore_website_content_read_v1'?{data:metadata,error:null}:{error:{message:'view unavailable'}},from(table){
 const filters=[];let one=false,start=0,end=Infinity;const q={select(){return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},like(k,v){filters.push(r=>String(r[k]||'').includes(v.replaceAll('%','')));return q;},order(){return q;},range(a,b){start=a;end=b;return q;},maybeSingle(){one=true;return q;},then(resolve){const rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:one?rows[0]||null:rows.slice(start,end+1),count:rows.length,error:null}).then(resolve);}};return q;}};}
test('an edited-word search supplements only eligible snapshot rows and bypasses stale canonical-token prefilters',async()=>{
 const rows=buildCatalogueRows([product]),c=client({instore_catalogue:rows,instore_catalogue_state:[{id:true,refreshed_at:new Date().toISOString(),product_count:1,tiles:[],controls_fingerprint:controlsFingerprint(new Map(),new Map())}]});
 const result=await serveStoredCatalogue(c,{query:'silky',category:'',page:1,from:0,includeCatalogue:false,contentSnapshot:{...content,overrides:[...content.overrides,{...content.overrides[0],sku:'ABSENT'}]}});
 assert.equal(result.body.total,1);assert.equal(result.body.products[0].name,'Silky summer bracelet');assert.equal(result.body.products[0].sku,product.sku);
 assert.equal(rows[0].payload.name,'BRACELET');
});
test('a legacy/mismatched eligible snapshot is refused until normal source rebuild binds the exact identity',async()=>{
 const old={...product};delete old.instoreSourceIdentity;
 const c=client({instore_catalogue:buildCatalogueRows([old]),instore_catalogue_state:[{id:true,refreshed_at:new Date().toISOString(),product_count:1,tiles:[],controls_fingerprint:controlsFingerprint(new Map(),new Map())}]});
 const result=await serveStoredCatalogue(c,{query:'silky',category:'',page:1,from:0,includeCatalogue:false,contentSnapshot:content});assert.equal(result.body,null);assert.equal(result.staleBeforeMs,0);
});
test('checkout uses trusted website wording while re-verifying canonical barcode, fresh price/unit and preference',async()=>{
 const index={sku:product.sku,barcode:product.barcode,title:'BRACELET',image_source:'nutstore',is_active:true,image_review_status:'verified',visibility_status:'search_only',price:1,image_url:product.image};
 const c=client({extended_range_items:[index]});
 const result=await resolveInstorePrices([{qty:2,preference:'Blue',product:{id:product.sku,sku:product.sku,name:'FORGED',barcode:'FORGED',price:.01,isExtendedRange:true}}],{index:c,bridgeEnv:{STOCK_SQL_BRIDGE_URL:'https://bridge.example.test',STOCK_SQL_BRIDGE_KEY:'synthetic-only'},fetchBridge:async()=>({ok:true,json:async()=>({row:{CODE:product.sku,DESCR:'Live source bracelet',PRICE_A:27.83,UNITS:'EACH',ONHAND:18,BOOKED:0}})})});
 assert.equal(result[0].product.name,'Silky summer bracelet');assert.equal(result[0].product.sourceDescription,'Live source bracelet');assert.equal(result[0].product.price,32);assert.equal(result[0].product.barcode,product.barcode);assert.equal(result[0].product.unitsOfIssue,'EACH');assert.equal(result[0].preference,'Blue');
});
test('the authenticated generation probe reads no catalogue or override payload and cannot mutate',async()=>{
 let args,sourceReads=0;const c={rpc:async(name,body)=>{args={name,body};return {data:{generation:'3',overrides:[]}};},from(){sourceReads++;throw Error('Unexpected catalogue read');}};
 const res={setHeader(){},status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;}};
 await createExtendedRangeHandler({authorize:async()=>true,getClient:()=>c})({method:'GET',headers:{host:'www.proto.co.za'},query:{content:'generation'}},res);
 assert.equal(res.statusCode,200);assert.deepEqual(res.body,{contentGeneration:'3'});assert.deepEqual(args,{name:'instore_website_content_read_v1',body:{p_skus:[]}});assert.equal(sourceReads,0);
});
