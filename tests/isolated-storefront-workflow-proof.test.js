import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{runSyntheticStorefrontProof} from '../api/isolated-storefront-workflow-proof.js';

test('actual storefront computation paths return matching synthetic description, stock and price',async()=>{
 assert.deepEqual(await runSyntheticStorefrontProof(),{confirmed:true,sku:'TEST-SAR-001',description:'Synthetic hosted description',stock:19,orderDescription:'Synthetic hosted description',orderPrice:11.5,barcode:'TEST-SAR-001'});
});
test('hosted proof is unavailable on production and unrelated branches',async()=>{
 const original={...process.env};
 try{
  for(const env of [{VERCEL_ENV:'production',VERCEL_PROJECT_ID:'prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu',VERCEL_GIT_COMMIT_REF:'codex/isolated-storefront-workflow-20261106'},{VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu',VERCEL_GIT_COMMIT_REF:'main'}]){
   Object.assign(process.env,env);let status;const res={setHeader(){},status(n){status=n;return this},json(){return this}};
   await handler({method:'GET',url:'/api/isolated-storefront-workflow-proof',headers:{host:'protoportal-main-test-proto-team.vercel.app'}},res);
   assert.equal(status,404);
  }
 }finally{process.env=original;}
});

