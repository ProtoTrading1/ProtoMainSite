import test from 'node:test';
import assert from 'node:assert/strict';
import { attachInstoreMoveGalleries } from '../lib/instore-move-galleries.mjs';

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
