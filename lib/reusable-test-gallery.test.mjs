import test from 'node:test';
import assert from 'node:assert/strict';
import {createReusableTestGallery} from './reusable-test-gallery.mjs';
const host='protoportal-main-git-codex-isolated-storefron-e45b85-proto-team.vercel.app';
const env={VERCEL:'1',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu',VERCEL_GIT_COMMIT_REF:'codex/isolated-storefront-workflow-20261106',PROTO_ISOLATED_TEST_READ_TOKEN:'a'.repeat(64),PROTO_ISOLATED_TEST_ANON_KEY:'sb_publishable_'+ 'x'.repeat(25)};
const runId='10000000-0000-4000-8000-000000000009';
const request={method:'GET',url:'/api/reusable-gallery-proof?runId='+runId,headers:{host}};
function response(){return {setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};}
test('reads approved-photo Test gallery metadata for an authorized owner',async()=>{
 const photos=Array.from({length:17},(_,i)=>{const photoId=`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,sha256=i.toString(16).padStart(64,'0');return {photoId,sha256,url:`https://pyrwimlmmruxtuxhdsom.supabase.co/storage/v1/object/sign/recovery-full-ui-20261110/reusable-review-v1/${runId}/${photoId}/${sha256}.jpg?token=test`};});let target='';
 const h=createReusableTestGallery({env,authenticate:async()=>({email:'online@proto.co.za'}),transport:async(url,init)=>{target=url;assert.equal(init.method,'POST');return new Response(JSON.stringify({status:'actual_gallery',sku:'TEST-SERVIETTES',mainPhotoId:photos[0].photoId,photos}));}});
 const r=response();await h(request,r);assert.equal(r.code,200);assert.equal(r.value.photos.length,17);assert.match(target,/^https:\/\/pyrwimlmmruxtuxhdsom\.supabase\.co\//);
});
test('rejects non-owner and production scopes without calling Test',async()=>{
 let calls=0;const transport=async()=>{calls++;throw Error();};
 for(const [e,user] of [[env,{email:'customer@example.test'}],[{...env,VERCEL_ENV:'production'},{email:'online@proto.co.za'}]]){
  const r=response();await createReusableTestGallery({env:e,authenticate:async()=>user,transport})(request,r);assert.equal(r.code,403);
 }assert.equal(calls,0);
});
