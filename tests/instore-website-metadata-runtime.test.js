import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebsiteMetadataProvider,websiteMetadataRuntime} from '../api/_instore-website-metadata-runtime.js';

test('metadata is off by default and rejects a mismatched website project',()=>{
 assert.equal(websiteMetadataRuntime({}),null);
 assert.throws(()=>websiteMetadataRuntime({PROTO_INSTORE_WEBSITE_METADATA_ENABLED:'1',VITE_SUPABASE_URL:'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',PROTO_INSTORE_WEBSITE_METADATA_URL:'https://bbbbbbbbbbbbbbbbbbbb.supabase.co',SUPABASE_SECRET_KEY:'synthetic'}),/configuration unavailable/);
});
test('provider requests exact, deduplicated codes and rejects incomplete or unrelated results',async()=>{
 let args;const provider=createWebsiteMetadataProvider({rpc:async(name,params)=>{args={name,params};return {data:{complete:true,overlays:[{sku:'ABC'}]},error:null};}});
 assert.equal((await provider(['abc','ABC'])).complete,true);
 assert.deepEqual(args,{name:'website_instore_metadata_read_v1',params:{p_skus:['ABC']}});
 await assert.rejects(provider(['not valid']),/Invalid website metadata request/);
 await assert.rejects(createWebsiteMetadataProvider({rpc:async()=>({data:{complete:true,overlays:[{sku:'OTHER'}]}})})(['ABC']),/Invalid website metadata response/);
 await assert.rejects(createWebsiteMetadataProvider({rpc:async()=>({data:{complete:false,overlays:[]}})})(['ABC']),/Website metadata unavailable/);
});

