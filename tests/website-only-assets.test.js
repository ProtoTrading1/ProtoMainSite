import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('all 246 prepared proof assets match their recorded file hashes',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../api/_website-only-manifest.json',import.meta.url),'utf8'));
 const assets=manifest.items.flatMap(item=>item.photos.map(photo=>({...photo,sku:item.sku})));
 assert.equal(assets.length,246);
 for(const asset of assets) {
   assert.match(asset.path,/^\/product-options\/website-only-163\/[A-Z0-9-]+\/[a-f0-9]{64}\.(jpg|png)$/);
   const bytes=await readFile(new URL('../public'+asset.path,import.meta.url));
   assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.sku);
 }
});
