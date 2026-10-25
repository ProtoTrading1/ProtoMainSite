import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
let sequence=0;
async function fixture(){globalThis.__catalogueColdAuth={auth:{}};const source=(await readFile(new URL('../src/lib/authHeaders.js',import.meta.url),'utf8')).replace("import { supabase } from './supabase';",'const supabase=globalThis.__catalogueColdAuth;');const auth=await import(`data:text/javascript;base64,${Buffer.from(source+'\n// cold '+sequence++).toString('base64')}`);auth.rememberAuthSession({user:{id:'synthetic-cold-account'},access_token:'synthetic-cold-token'});return auth;}
test('the actual full-catalogue budget accepts a thirteen-second JSON body with one authenticated request',async t=>{
 const source=await readFile(new URL('../src/lib/products.js',import.meta.url),'utf8'),budget=Number(source.match(/fetchJsonWithTimeout\('\/api\/products', (\d+)/)[1]),auth=await fixture();
 const original=globalThis.fetch;let entered,calls=0;const bodyStarted=new Promise(resolve=>entered=resolve);t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(_url,{signal,headers})=>{calls++;assert.equal(headers.Authorization,'Bearer synthetic-cold-token');return {status:200,ok:true,json:()=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});setTimeout(()=>resolve([{sku:'SYNTHETIC-COLD'}]),13000);entered();})};};
 try{const pending=auth.authenticatedGetJson('/api/products',{timeoutMs:budget});await bodyStarted;t.mock.timers.tick(13000);assert.deepEqual((await pending).data,[{sku:'SYNTHETIC-COLD'}]);assert.equal(calls,1);assert.ok(budget<=60000&&budget>13000);}finally{globalThis.fetch=original;}
});
test('a stalled cold response still aborts within the full-catalogue budget without retry',async t=>{
 const auth=await fixture(),original=globalThis.fetch;let entered,calls=0;const bodyStarted=new Promise(resolve=>entered=resolve);t.mock.timers.enable({apis:['setTimeout']});
 globalThis.fetch=async(_url,{signal})=>{calls++;return {status:200,ok:true,json:()=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});entered();})};};
 try{const pending=auth.authenticatedGetJson('/api/products',{timeoutMs:45000});const rejected=assert.rejects(pending,{name:'AbortError'});await bodyStarted;t.mock.timers.tick(45000);await rejected;assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
