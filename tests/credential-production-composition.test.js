import test from 'node:test';
import assert from 'node:assert/strict';
import { stockClient, previewCatalogueClient } from '../api/extended-range.js';
const names=['STOCK_SUPABASE_POOLER_URL','STOCK_SUPABASE_KEY','VERCEL_ENV','INSTORE_PREVIEW_SUPABASE_URL','INSTORE_PREVIEW_SUPABASE_SERVICE_ROLE_KEY','INSTORE_PREVIEW_RUN_ID'];
test('composed current-main Instore stock client uses replacement binding while isolated preview retains its source',async()=>{
 const saved=Object.fromEntries(names.map(n=>[n,process.env[n]]));const originalFetch=globalThis.fetch;const calls=[];
 try{
  process.env.VERCEL_ENV='production';process.env.STOCK_SUPABASE_POOLER_URL='https://yiqsvwajozafvalwcero.supabase.co';process.env.STOCK_SUPABASE_KEY='sb_secret_SYNTHETIC_COMPOSITION_FIXTURE_12345';
  process.env.INSTORE_PREVIEW_SUPABASE_URL='https://pyrwimlmmruxtuxhdsom.supabase.co';process.env.INSTORE_PREVIEW_SUPABASE_SERVICE_ROLE_KEY='legacy_isolated_fixture';process.env.INSTORE_PREVIEW_RUN_ID='synthetic-isolated-run';
  globalThis.fetch=async(url,init)=>{calls.push({url:String(url),headers:new Headers(init.headers),method:init.method});return new Response('[]',{status:200,headers:{'content-type':'application/json'}});};
  const current=await stockClient().from('extended_range_items').select('sku').limit(1);assert.equal(current.error,null);
  const preview=previewCatalogueClient();assert.equal(preview.runId,'synthetic-isolated-run');const isolated=await preview.client.from('preview_instore_items').select('sku').limit(1);assert.equal(isolated.error,null);
  assert.equal(calls.length,2);assert.equal(new URL(calls[0].url).origin,process.env.STOCK_SUPABASE_POOLER_URL);assert.equal(calls[0].headers.get('apikey'),process.env.STOCK_SUPABASE_KEY);assert.equal(calls[0].headers.get('authorization'),null);
  assert.equal(new URL(calls[1].url).origin,process.env.INSTORE_PREVIEW_SUPABASE_URL);assert.equal(calls[1].headers.get('apikey'),'legacy_isolated_fixture');assert.equal(calls[1].headers.get('authorization'),'Bearer legacy_isolated_fixture');assert.ok(calls.every(c=>c.method==='GET'));
 }finally{globalThis.fetch=originalFetch;for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});
