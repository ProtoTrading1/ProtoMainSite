import {test} from 'node:test';
import assert from 'node:assert/strict';
import {attachArchivePublicationGalleries as attach} from '../lib/archive-publication-galleries.mjs';
const root='https://admin.proto.co.za/api/archive-publication-image/'+'a'.repeat(64)+'/';
const images=Array.from({length:8},(_,n)=>root+`10000000-0000-4000-8000-${String(n).padStart(12,'0')}/`+'b'.repeat(64)+'.png');
const product={sku:'SYNTHETIC-GALLERY',images:[images[0]],image:images[0],stockOnHand:47};
const gallery={sku:product.sku,currentImage:images[0],imageUrls:images};
const client=data=>{const calls=[];return {calls,rpc(...args){calls.push(args);return {abortSignal:async()=>({data})};}};};
for(const destination of ['website','instore'])test('attaches eight completed '+destination+' photos to one product',async()=>{
 const c=client([gallery]),result=await attach([product],c,destination);
 assert.deepEqual(result,[{...product,images}]);assert.equal(product.images.length,1);
 assert.deepEqual(c.calls,[['loader_archive_publication_galleries_v1',{p_body:{destination,skus:[product.sku]}}]]);
});
for(const mode of ['hidden','changed','duplicate','foreign','incomplete','error'])test('preserves catalogue on '+mode+' gallery',async()=>{
 const p=structuredClone(product),g=structuredClone(gallery),c=client([g]);
 if(mode==='hidden')p.imageStatus='hidden';if(mode==='changed')g.currentImage=images[1];
 if(mode==='duplicate')g.imageUrls[1]=images[0];if(mode==='foreign')g.imageUrls[1]=images[1].replace('/'+'a'.repeat(64)+'/', '/'+'c'.repeat(64)+'/');
 if(mode==='incomplete')g.imageUrls=[images[0]];if(mode==='error')c.rpc=()=>{throw Error();};
 assert.deepEqual(await attach([p],c,'instore'),[p]);
});
test('does not fetch or broaden older galleries',async()=>{const c=client([]),p={...product,images:['https://example.invalid/image.png']};assert.deepEqual(await attach([p],c,'website'),[p]);assert.equal(c.calls.length,0);});
test('bounds gallery batches to 200',async()=>{const c=client([]),p=Array.from({length:201},(_,n)=>({...product,sku:`SYNTHETIC-${n}`}));assert.deepEqual(await attach(p,c,'website'),p);assert.deepEqual(c.calls.map(x=>x[1].p_body.skus.length),[200,1]);});
