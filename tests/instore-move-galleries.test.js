import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInstoreMoveGalleries, instoreMoveGalleriesEnabled } from '../lib/instore-move-galleries.mjs';

const urls = Array.from({ length: 8 }, (_, i) => `https://images.example.test/kept-${i}.jpg`);
const product = { sku: 'SYNTHETIC-MOVE', hasPreservedInstoreGallery: true, image: urls[0], images: urls.slice(0, 4), stockQty: 20, price: 12.5 };
const client = data => ({ rpc: (name, body) => {
  assert.equal(name, 'loader_archive_listing_move_galleries_v1');
  assert.deepEqual(body, { p_body: { skus: ['SYNTHETIC-MOVE'] } });
  return { abortSignal: async () => ({ data }) };
} });
const gallery = { sku: product.sku, currentImage: urls[0], imageUrls: urls };

test('preserves all eight existing photos in server enrichment without changing price or stock', async () => {
  const result = await attachInstoreMoveGalleries([product], client([gallery]));
  assert.deepEqual(result, [{ ...product, images: urls }]);
  assert.equal(product.images.length, 4);
});
test('ordinary products do not acquire another request', async () => {
  const products = [{ ...product, hasPreservedInstoreGallery: false }];
  assert.equal(await attachInstoreMoveGalleries(products, () => { throw Error('must not open client'); }), products);
});
test('a changed main cannot resurrect a superseded gallery', async () => {
  const products = [{ ...product, images: ['https://images.example.test/new-main.jpg'] }];
  assert.deepEqual(await attachInstoreMoveGalleries(products, client([gallery])), products);
});
for (const invalid of [
  { ...gallery, imageUrls: [...urls, urls[0]] },
  { ...gallery, imageUrls: Array.from({length:201},(_,i)=>`https://images.example.test/${i}.jpg`) },
  { ...gallery, imageUrls: ['http://images.example.test/not-https.jpg'] },
  { ...gallery, imageUrls: [urls[0], 'https://user:password@images.example.test/a.jpg'] },
  { ...gallery, imageUrls: [urls[0], 'https://images.example.test/a.jpg?token=private'] },
  { ...gallery, sku: 'WRONG-SKU' },
]) test(`holds malformed gallery ${JSON.stringify(invalid)}`, async () => {
  assert.deepEqual(await attachInstoreMoveGalleries([product], client([invalid])), [product]);
});
test('an unavailable gallery reader leaves the current listing intact', async () => {
  assert.deepEqual(await attachInstoreMoveGalleries([product], { rpc() { throw Error('unavailable'); } }), [product]);
});

test('preserves the complete supported 200-photo gallery', async () => {
  const all=Array.from({length:200},(_,i)=>`https://images.example.test/photo-${i}.jpg`);
  const moved={...product,image:all[0],images:all.slice(0,4)};
  const result=await attachInstoreMoveGalleries([moved],client([{sku:product.sku,currentImage:all[0],imageUrls:all}]));
  assert.deepEqual(result[0].images,all);
});

test('hidden moved products never fetch or restore galleries', async () => {
  const hidden = [{...product,imageStatus:'hidden'}];
  assert.equal(await attachInstoreMoveGalleries(hidden, () => {throw Error('must not read');}), hidden);
});
test('missing RPC preserves the exact original result', async () => {
  const products=[product], missing={rpc:()=>({abortSignal:async()=>({data:null,error:{code:'PGRST202'}})})};
  assert.equal(await attachInstoreMoveGalleries(products,missing),products);
});
test('a failed later batch does not leak a partially enriched result', async () => {
  const products=Array.from({length:21},(_,i)=>({...product,sku:`SYNTHETIC-${i}`}));let calls=0;
  const reader={rpc:(name,{p_body})=>({abortSignal:async()=>{calls++;return calls===1?{data:p_body.skus.map(sku=>({...gallery,sku}))}:{error:{code:'held'}};}})};
  assert.equal(await attachInstoreMoveGalleries(products,reader),products);assert.equal(calls,2);
});
test('a bounded aborted read leaves the current catalogue intact', async () => {
  const products=[product];let aborts=0;
  const reader={rpc:()=>({abortSignal:signal=>new Promise((resolve,reject)=>{const keeper=setTimeout(resolve,100);signal.addEventListener('abort',()=>{aborts++;clearTimeout(keeper);reject(Error('timeout'));},{once:true});})})};
  assert.equal(await attachInstoreMoveGalleries(products,reader,{timeoutMs:5}),products);assert.equal(aborts,1);
});

test('move gallery activation requires the exact server-only opt-in',()=>{
  for(const value of [undefined,null,'',0,1,true,'true','0',' 1'])assert.equal(instoreMoveGalleriesEnabled({PROTO_ARCHIVE_MOVE_GALLERIES_ENABLED:value}),false);
  assert.equal(instoreMoveGalleriesEnabled({PROTO_ARCHIVE_MOVE_GALLERIES_ENABLED:'1'}),true);
});
