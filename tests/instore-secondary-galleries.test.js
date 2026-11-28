import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildExtendedRangeProducts} from '../api/extended-range.js';
import {attachInstoreSecondaryGalleries as attach} from '../lib/instore-secondary-galleries.mjs';
const root='https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/instore-secondary-v1/';
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'];
const extra=(n=0)=>root+ids[n%2]+'/'+(n?'b':'a').repeat(64)+'.png';
const primary='https://images.example.test/unchanged-main.jpg',base2='https://images.example.test/old-gallery.jpg';
const product={id:'8622930082',sku:'8622930082',image:primary,images:[primary,base2],imageStatus:'visible',isExtendedRange:true,instoreSourceIdentity:'c'.repeat(64),price:27.5,stockQty:35,stockOnHand:35,unitsOfIssue:'EACH'};
const gallery=()=>({sku:product.sku,sourceIdentitySHA:product.instoreSourceIdentity,mainUrl:primary,baseImageUrls:[primary,base2],imageUrls:[primary,base2,extra(),extra(1)],managedImageUrls:[extra(),extra(1)],revision:2,operationId:ids[1]});
const envelope=()=>({protocol:'proto.instore-secondary-gallery.v1',generation:'42',galleries:[gallery()]});
function client(data=envelope()){const calls=[];return {calls,rpc(name,body){calls.push({name,body});return {abortSignal:async()=>({data})};}};}

test('ordinary secondary photos preserve main/base order, all order metadata and no option/variant fields',async()=>{
 const c=client(),before=structuredClone(product),[result]=await attach([product],c,{generation:'42'});
 assert.deepEqual(result,{...product,images:gallery().imageUrls});assert.deepEqual(product,before);
 assert.deepEqual(c.calls,[{name:'instore_secondary_gallery_read_v1',body:{p_body:{skus:[product.sku]}}}]);
 for(const key of ['colourOptions','variants','isVariantGroup','preferredColour','preferredStyle'])assert.equal(Object.hasOwn(result,key),false);
});

test('cached managed photos are stripped on absent, revoked, failed or malformed reader without losing legacy gallery',async()=>{
 const cached={...product,images:[primary,base2,extra(),root+'malformed.png']};
 for(const c of [client({...envelope(),galleries:[]}),client(null),{rpc(){throw Error('unavailable');}},client({...envelope(),generation:'41'})])assert.deepEqual(await attach([cached],c,{generation:'42'}),[product]);
 assert.deepEqual(await attach([cached],client(),{generation:'unavailable'}),[product]);
});

test('exact source/main/base/gallery/receipt bindings are mandatory, not just matching SKU',async()=>{
 const edits=[g=>{g.sourceIdentitySHA='d'.repeat(64);},g=>{g.mainUrl=base2;},g=>{g.baseImageUrls.reverse();},g=>{g.imageUrls.reverse();},g=>{g.imageUrls.push(extra());},g=>{g.managedImageUrls=[extra(1)];},g=>{g.managedImageUrls[0]='https://other.example.test/extra.png';},g=>{g.operationId='not-an-operation';},g=>{g.revision=0;},g=>{g.sku='OTHER';},g=>{g.rawPrivateBytes='forbidden';}];
 for(const edit of edits){const e=envelope();edit(e.galleries[0]);assert.deepEqual(await attach([product],client(e),{generation:'42'}),[product]);}
});

test('hidden, unbound, non-Instore and protected family products never gain secondary photos',async()=>{
 for(const p of [{...product,imageStatus:'hidden'},{...product,instoreSourceIdentity:''},{...product,isExtendedRange:false},{...product,cat07Family:{status:'complete'}}]){
  const c=client();assert.deepEqual(await attach([p],c,{generation:'42'}),[p]);assert.equal(c.calls.length,0);
 }
});

test('maximum32 total photos is explicit; a valid old multi-photo base remains intact',async()=>{
 const additions=Array.from({length:30},(_,n)=>root+ids[0]+'/'+n.toString(16).padStart(64,'0')+'.png');
 const e=envelope();e.galleries[0].managedImageUrls=additions;e.galleries[0].imageUrls=[primary,base2,...additions];
 assert.equal((await attach([product],client(e),{generation:'42'}))[0].images.length,32);
 e.galleries[0].managedImageUrls.push(extra());e.galleries[0].imageUrls.push(extra());assert.deepEqual(await attach([product],client(e),{generation:'42'}),[product]);

});

test('one invalid row or duplicate SKU cannot partially authorize its response cohort',async()=>{
 for(const e of [{...envelope(),galleries:[gallery(),gallery()]},{...envelope(),unexpected:true}])assert.deepEqual(await attach([product],client(e),{generation:'42'}),[product]);
});

test('deadline is bounded even if injected transport ignores cancellation and late results cannot restore photos',async()=>{
 let release,signal;const c={rpc(){return {abortSignal:current=>{signal=current;return new Promise(resolve=>{release=()=>resolve({data:envelope()});});}};}};
 const cached={...product,images:[...product.images,extra()]},result=await attach([cached],c,{generation:'42',timeoutMs:20});
 assert.deepEqual(result,[product]);assert.equal(signal.aborted,true);release();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(result,[product]);
});

test('actual offline SQL-produced reader binds the existing raw identity hash, main and content generation without rewriting source metadata',async()=>{
 const vector=JSON.parse(readFileSync(new URL('./fixtures/instore-secondary-sql-reader.json',import.meta.url),'utf8'));
 assert.match(vector.scope,/OFFLINE/);const [canonical]=buildExtendedRangeProducts([vector.row],'',{pricesAreInclusive:true});
 assert.equal(canonical.instoreSourceIdentity,vector.reader.galleries[0].sourceIdentitySHA);
 const before=structuredClone(canonical),[result]=await attach([canonical],client(vector.reader),{generation:vector.contentSnapshot.generation});
 assert.deepEqual(result.images,vector.reader.galleries[0].imageUrls);assert.equal(result.images[0],vector.row.image_url);
 for(const key of Object.keys(before).filter(key=>key!=='images'))assert.deepEqual(result[key],before[key]);
 assert.deepEqual(canonical,before);assert.equal(result.images.length,2);assert.equal(result.stockQty,44);assert.equal(result.price,27.5);
 const moved=buildExtendedRangeProducts([{...vector.row,image_url:'https://images.example.test/replacement.jpg'}],'',{pricesAreInclusive:true});
 assert.deepEqual(await attach(moved,client(vector.reader),{generation:vector.contentSnapshot.generation}),moved);
 assert.deepEqual(buildExtendedRangeProducts([{...vector.row,is_active:false}]),[]);
});

test('an asynchronous RPC rejection is consumed without unhandled work; a promise-only valid reader keeps the same strict contract',async()=>{
 const cached={...product,images:[...product.images,extra()]};
 assert.deepEqual(await attach([cached],{rpc:async()=>{throw Error('Reader unavailable');}},{generation:'42'}),[product]);
 const [result]=await attach([product],{rpc:async()=>({data:envelope()})},{generation:'42'});assert.deepEqual(result.images,gallery().imageUrls);
});

test('a full catalogue of unrelated products adds only one two-SKU RPC and cannot broaden any other product',async()=>{
 const unrelated=Array.from({length:5000},(_,index)=>({...product,sku:'UNRELATED-'+index,id:'UNRELATED-'+index}));
 const targets=[product,{...product,sku:'8622930083',id:'8622930083'}],products=[...unrelated,...targets],c=client({...envelope(),galleries:[]});
 assert.deepEqual(await attach(products,c,{generation:'42'}),products);
 assert.deepEqual(c.calls,[{name:'instore_secondary_gallery_read_v1',body:{p_body:{skus:['8622930082','8622930083']}}}]);
 const none=client();assert.deepEqual(await attach(unrelated,none,{generation:'42'}),unrelated);assert.equal(none.calls.length,0);
 const cached={...unrelated[0],images:[primary,base2,extra()]};assert.deepEqual(await attach([cached],none,{generation:'42'}),[unrelated[0]]);
});
