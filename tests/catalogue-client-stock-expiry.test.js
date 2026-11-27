import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scrubCachedShowroomStock} from '../src/lib/catalogueStockFreshness.js';
const product=(now,qty=96)=>({sku:'8640000255',id:'8640000255',code:'8640000255',barcode:'8640000255',name:'Original balloons',price:16.5,unitsOfIssue:'PACK12',image:'original.jpg',images:['original.jpg'],categoryPath:['party'],stockQty:qty,stockOnHand:qty,inStock:qty>0,stockSource:'positill_live',stockCheckedAt:new Date(now).toISOString(),availability:{state:'in_stock',canOrder:qty>0}});
async function actualClient(t,{now,stored=null,load}){
 const storage=new Map(stored?[['proto_catalog_v13',JSON.stringify(stored)]]:[]),previous=globalThis.localStorage;
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 t.after(()=>{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous;});
 t.mock.method(Date,'now',()=>now.value);
 const source=(await readFile(new URL('../src/lib/products.js',import.meta.url),'utf8')).replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'').replace(/\bexport /g,'');
 const deps={scrubCachedShowroomStock,authenticatedGetJson:async url=>({response:{ok:true},data:await load(url)}),getFeaturedProducts:async()=>['8640000255'],invalidateFeaturedCache:()=>{},getActiveTaxonomy:()=>[],preloadProductImages:()=>{},fuzzyFilter:p=>p,applyCollection:p=>p,sortNewArrivals:p=>p,isIdentifierQuery:query=>/^\d{10}$/.test(query),expandBarcodeSiblings:(_pool,p)=>p,groupProductsByBarcode:p=>p,spotlightChristmasPenCode:p=>p,resolveNavPathForProducts:path=>path,productCountKey:path=>path.join('/'),inferMotarroPathFromRow:()=>[],isMotarroBrowsePath:()=>false,isMotarroProduct:()=>false,motarroPathMatchesFilter:()=>false,applySkuOrder:p=>p,lookupSortOrder:()=>[]};
 return new Function('deps',`const {${Object.keys(deps).join(',')}}=deps;\n${source}\nreturn {fetchProducts,refreshProductCache,fetchProductPage,fetchCategoryCounts,fetchProductsBySkus,fetchIdentifierProducts};`)(deps);
}
test('unproved or24hour cached stock is unknown without changing photos/price/unit; current proof expires at30seconds',()=>{
 const now=Date.now();for(const p of [{...product(now),stockSource:undefined},product(now-23*3600000),product(now+1000)]){const [safe]=scrubCachedShowroomStock([p],now);assert.equal(safe.stockQty,null);assert.equal(safe.inStock,false);assert.equal(safe.availability.canOrder,false);assert.equal(safe.price,p.price);assert.equal(safe.unitsOfIssue,p.unitsOfIssue);assert.equal(safe.image,p.image);assert.deepEqual(safe.images,p.images);}
 const fresh=[product(now,68)];assert.equal(scrubCachedShowroomStock(fresh,now+30000),fresh);assert.equal(scrubCachedShowroomStock(fresh,now+30001)[0].stockQty,null);
});
test('separate family/Instore/floral contracts and incoming/to-order permissions remain',()=>{
 const now=Date.now(),separate=[{...product(0),isExtendedRange:true},{...product(0),sku:'8-34'},{...product(0),sku:'8640000274'},{...product(0),barcode:'8626000794'}];for(const p of separate)assert.equal(scrubCachedShowroomStock([p],now)[0],p);
 for(const p of [{...product(0),toOrder:true},{...product(0),availability:{incomingStatus:'landed_awaiting_grv',incomingQty:100}}]){const [safe]=scrubCachedShowroomStock([p],now);assert.equal(safe.stockQty,null);assert.equal(safe.availability.canOrder,true);}
 const grouped={isVariantGroup:true,variants:[product(0),{...product(0),id:'SECOND',image:'second.jpg'}]};const [safe]=scrubCachedShowroomStock([grouped],now);assert.deepEqual(safe.variants.map(p=>p.stockQty),[null,null]);assert.equal(safe.variants[1].image,'second.jpg');
});
test('actual24hour persistence plus failed network never confirms cached96 through full/page/SKU fallback',async t=>{
 const now={value:200000000},old=product(now.value-23*3600000);const client=await actualClient(t,{now,stored:{data:[old],ts:now.value-23*3600000},load:async()=>{throw Error('offline');}});
 assert.equal((await client.fetchProducts())[0].stockQty,null);await new Promise(resolve=>setImmediate(resolve));assert.equal((await client.fetchProducts())[0].stockQty,null);
 const page=await client.fetchProductPage({searchQuery:'balloons',sort:'name-asc',inStockOnly:true});assert.equal(page.total,0);
 assert.equal((await client.fetchProductsBySkus(['8640000255'])).get('8640000255').stockQty,null);
});
test('actual memory/category counts expire and fresh restock becomes discoverable after ordinary refresh',async t=>{
 const now={value:100000};let qty=0;const client=await actualClient(t,{now,load:async()=>[product(now.value,qty)]});await client.fetchProducts();assert.equal((await client.fetchCategoryCounts({inStockOnly:true}))[''],0);
 qty=5;now.value+=30001;await client.refreshProductCache({maxAgeMs:0});assert.equal((await client.fetchCategoryCounts({inStockOnly:true}))[''],1);assert.equal((await client.fetchProductPage({searchQuery:'balloons',sort:'name-asc',inStockOnly:true})).products[0].stockQty,5);
 now.value+=30001;assert.equal((await client.fetchProducts())[0].stockQty,null);assert.equal((await client.fetchCategoryCounts({inStockOnly:true}))[''],0);
});
test('actual browse cache and featured cache expire even before card mount and while refresh fails',async t=>{
 const now={value:100000};let offline=false;const client=await actualClient(t,{now,load:async()=>{if(offline)throw Error('offline');return [product(now.value,68)];}});
 assert.equal((await client.fetchProductPage({categoryPath:['party'],sort:'name-asc',inStockOnly:true})).products[0].stockQty,68);
 assert.equal((await client.fetchProductPage({inStockOnly:true})).products[0].stockQty,68);
 offline=true;now.value+=30001;
 assert.equal((await client.fetchProductPage({categoryPath:['party'],sort:'name-asc',inStockOnly:true})).total,0);
 assert.equal((await client.fetchProductPage({inStockOnly:true})).total,0);
});
test('actual API ingestion rejects missing proof and identifier requests expire at their source timestamp',async t=>{
 const now={value:100000};let proved=false;const client=await actualClient(t,{now,load:async()=>[{...product(now.value,68),stockSource:proved?'positill_live':undefined}]});assert.equal((await client.fetchProducts())[0].stockQty,null);
 proved=true;const [fresh]=await client.fetchIdentifierProducts('8640000255');assert.equal(fresh.stockQty,68);now.value+=30001;const [expired]=await client.fetchIdentifierProducts('8640000255');assert.equal(expired.stockQty,null);
});
