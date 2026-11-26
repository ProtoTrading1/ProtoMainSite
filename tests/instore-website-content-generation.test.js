import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// Execute the actual browser cache module with its network/image adapters
// replaced by deterministic local functions. No browser/account requests.
async function moduleWithNetwork(network){
 let source=await readFile(new URL('../src/lib/extendedRange.js',import.meta.url),'utf8');
 source=source.replace(/import[\s\S]*?from '\.\.\/\.\.\/lib\/instore-response-cache\.mjs';/,'');
 source=source.replaceAll('export async function ','async function ').replaceAll('export function ','function ');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 return new AsyncFunction('authenticatedGetJson','preloadProductImages','instorePage','RESPONSE_CACHE_TTL_MS','STORAGE_KEY_PREFIX','STORED_RESPONSE_LIMIT','STORED_RESPONSE_MAX_BYTES','instoreRequestKey','storedResponseIsUsable',source+';return {fetchExtendedRange,fetchCollection,instoreCatalogue,revalidateInstoreWebsiteContent};')(network,()=>{},products=>({products}),30000,'synthetic:',8,512000,query=>query,()=>false);
}
test('late older text generations cannot overwrite a newer response or its browser cache',async()=>{
 let release;const slow=new Promise(resolve=>{release=resolve;});
 const module=await moduleWithNetwork(async url=>url.endsWith('old')?slow:{response:{ok:true},data:{contentGeneration:'2',products:[]}});
 const old=module.fetchExtendedRange('old');await module.fetchExtendedRange('new');
 release({response:{ok:true},data:{contentGeneration:'1',products:[]}});
 await assert.rejects(old,/details changed/);
});
test('a new generation invalidates a held full collection before the next view can reuse old text',async()=>{
 let version='1';const module=await moduleWithNetwork(async()=>({response:{ok:true},data:{contentGeneration:version,products:[],catalogue:[{sku:'SYNTHETIC',name:version}]}}));
 await module.fetchCollection();assert.equal(module.instoreCatalogue()[0].name,'1');
 version='2';await module.fetchExtendedRange('fresh');assert.equal(module.instoreCatalogue(),null);
});
test('a late unavailable-generation collection cannot replace newer verified website text',async()=>{
 let release;const slow=new Promise(resolve=>{release=resolve;});let first=true;
 const module=await moduleWithNetwork(async()=>first?(first=false,slow):{response:{ok:true},data:{contentGeneration:'2',products:[]}});
 const pending=module.fetchCollection();await module.fetchExtendedRange('healthy');release({response:{ok:true},data:{contentGeneration:'unavailable',catalogue:[{sku:'A',name:'Source fallback'}],products:[]}});
 await assert.rejects(pending,/last verified collection/);assert.equal(module.instoreCatalogue(),null);
});
test('the first verified generation invalidates a previously held unavailable-version collection',async()=>{
 let version='unavailable';const module=await moduleWithNetwork(async()=>({response:{ok:true},data:{contentGeneration:version,products:[],catalogue:[{sku:'A',name:'Source fallback'}]}}));
 await module.fetchCollection();assert.ok(module.instoreCatalogue());version='2';await module.fetchExtendedRange('healthy');assert.equal(module.instoreCatalogue(),null);
});
test('generation revalidation refreshes a held collection, and does not fetch a collection a customer has never loaded',async()=>{
 let version='1',reads=0;const module=await moduleWithNetwork(async()=>{reads++;return {response:{ok:true},data:{contentGeneration:version,products:[],catalogue:[{sku:'A',name:version}]}};});
 await module.revalidateInstoreWebsiteContent();assert.equal(reads,0);
 await module.fetchCollection();version='2';await module.revalidateInstoreWebsiteContent();assert.equal(module.instoreCatalogue()[0].name,'2');assert.equal(reads,3);
});
test('failed refresh after a generation change retries on the next probe rather than stranding an open collection',async()=>{
 let version='1',fail=false;const module=await moduleWithNetwork(async url=>{
  if(!url.includes('content=generation')&&fail){fail=false;throw Error('Synthetic temporary failure');}
  return {response:{ok:true},data:{contentGeneration:version,products:[],catalogue:[{sku:'A',name:version}]}};
 });
 await module.fetchCollection();version='2';fail=true;await module.revalidateInstoreWebsiteContent();assert.equal(module.instoreCatalogue(),null);
 await module.revalidateInstoreWebsiteContent();assert.equal(module.instoreCatalogue()[0].name,'2');
});
