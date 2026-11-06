import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstoreEditorSourceRoute} from '../api/instore-editor-source.js';
const response=()=>({code:0,body:null,setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;return this;}});
const req=sku=>({method:'GET',query:{sku},headers:{host:'www.proto.co.za'}});
test('verified owner reads exact product from the unified catalogue',async()=>{
 const route=createInstoreEditorSourceRoute({env:{PROTO_INSTORE_EDITOR_SOURCE_ENABLED:'1'},authenticate:async()=>({email:'george@proto.co.za'}),getClient:()=>({}),
  load:async()=>({products:[{sku:'SYNTH-001',title:'Test drum',barcode:'SYNTH-001'},{sku:'OTHER',title:'Other',barcode:'OTHER'}]})});
 const res=response();await route(req('synth-001'),res);assert.equal(res.code,200);assert.deepEqual(res.body,{complete:true,rows:[{sku:'SYNTH-001',description:'Test drum',barcode:'SYNTH-001'}]});
});
test('rejects customer access, ambiguous rows, and disabled routes',async()=>{
 let res=response();await createInstoreEditorSourceRoute({env:{}})(req('SYNTH'),res);assert.equal(res.code,503);
 res=response();await createInstoreEditorSourceRoute({env:{PROTO_INSTORE_EDITOR_SOURCE_ENABLED:'1'},authenticate:async()=>({email:'customer@example.invalid'})})(req('SYNTH'),res);assert.equal(res.code,403);
 res=response();await createInstoreEditorSourceRoute({env:{PROTO_INSTORE_EDITOR_SOURCE_ENABLED:'1'},authenticate:async()=>({email:'george@proto.co.za'}),getClient:()=>({}),load:async()=>({products:[{sku:'SYNTH',title:'A'},{sku:'SYNTH',title:'B'}]})})(req('SYNTH'),res);assert.equal(res.code,503);
});
test('both persisted and website-only entries resolve by exact code',async()=>{
 const route=createInstoreEditorSourceRoute({env:{PROTO_INSTORE_EDITOR_SOURCE_ENABLED:'1'},authenticate:async()=>({email:'george@proto.co.za'}),getClient:()=>({}),
  load:async(_client,{websiteOnlyProvider})=>{const {rows}=await websiteOnlyProvider();return {products:[{sku:'LEGACY-001',title:'Legacy item',barcode:'LEGACY-001'},...rows]};},
  provider:async()=>({rows:[{sku:'WEB-001',title:'Website-only item',barcode:'WEB-001'}]})});
 for(const sku of ['LEGACY-001','WEB-001']){const res=response();await route(req(sku),res);assert.equal(res.code,200);assert.equal(res.body.rows[0].sku,sku);}
});
test('does not call an incomplete website-only source a complete lookup',async()=>{
 const route=createInstoreEditorSourceRoute({env:{PROTO_INSTORE_EDITOR_SOURCE_ENABLED:'1'},authenticate:async()=>({email:'george@proto.co.za'}),getClient:()=>({}),
  provider:async()=>{throw Error('unavailable');},load:async(_client,{websiteOnlyProvider})=>{try{await websiteOnlyProvider();}catch{/* Mirrors the catalogue fallback. */}return {products:[]};}});
 const res=response();await route(req('WEB-001'),res);assert.equal(res.code,503);
});

