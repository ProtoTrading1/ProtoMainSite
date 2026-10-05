import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegisterTradeHandler } from '../api/register-trade.js';
import { createRegistrationEmailCheckHandler } from '../api/check-registration-email.js';
import { registrationReceipt } from '../api/_registration-receipt.js';
import { registrationFieldErrors } from '../api/_registration-validation.js';
import { applicationFailure, isConfirmedTradeApplication } from '../src/lib/tradeApplicationAttempt.mjs';
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from '../src/lib/passwordPolicy.js';
import { validateRegistrationStep } from '../src/lib/registrationValidation.mjs';
import { safeServerRegistrationFields } from '../src/lib/registrationServerGuidance.mjs';

const id='00000000-0000-4000-8000-000000000007';
const allowed=async()=>({allowed:true});
const response=()=>({statusCode:200,headers:{},status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k]=v;},json(body){this.body=body;return this;},end(){return this;}});
const payload=()=>({email:'synthetic@fixture.invalid',password:'1234567890',contactName:'Synthetic Applicant',businessName:'Synthetic Trade',phone:'0825550123',companyAddress:'1 Fixture Road, Fixture Suburb',deliveryAddress:'1 Fixture Road, Fixture Suburb',country:'South Africa',streetName:'1 Fixture Road',suburb:'Fixture Suburb',city:'Fixture City',postalCode:'0001',buildingType:'House',acceptWhatsapp:false,salesChannels:['Physical retail store'],productCategories:['Gifts & novelty products'],businessDescription:'Synthetic gifts supplied to local shops.'});

test('intended signup/reset policy rejects eight and nine characters and accepts ten without adding phone rules',()=>{
  assert.equal(MIN_PASSWORD_LENGTH,10);
  for(const length of [0,8,9]) assert.match(passwordPolicyError('x'.repeat(length)),/10 characters/);
  assert.equal(passwordPolicyError('x'.repeat(10)),'');
  for(const phone of ['0825550123','+27825550123']) for(const consent of [true,false]) {
    assert.deepEqual(validateRegistrationStep(1,{email:'synthetic@fixture.invalid',phone,password:'1234567890',whatsappOptIn:consent}),{});
    assert.deepEqual(registrationFieldErrors({...payload(),phone,acceptWhatsapp:consent}),{});
  }
  for(const consent of [null,'true','false']) assert.ok(validateRegistrationStep(1,{email:'synthetic@fixture.invalid',phone:'0825550123',password:'1234567890',whatsappOptIn:consent}).whatsappOptIn);
});

test('server rejects blank/wrong-type required fields before provider, rate-limit or mail operations',async()=>{
  let sideEffects=0;
  const handler=createRegisterTradeHandler({createServiceClient:()=>{sideEffects++;throw Error('unexpected');},rateLimit:async()=>{sideEffects++;throw Error('unexpected');},sendVerification:async()=>{sideEffects++;},sendAdmin:async()=>{sideEffects++;}});
  for(const body of [null,undefined,[],1,'malformed']) {
    const res=response();await handler({method:'POST',headers:{},body},res);
    assert.equal(res.statusCode,400);assert.equal(res.body.code,'REGISTRATION_VALIDATION_FAILED');assert.equal(sideEffects,0);
  }
  for(const [field,key] of [['contactName','contactName'],['businessName','companyName'],['phone','phone'],['companyAddress','billingStreet'],['deliveryAddress','streetName'],['password','password'],['email','email']]) {
    for(const value of [' ',{},123]) {
      const res=response();
      await handler({method:'POST',headers:{},body:{...payload(),[field]:value}},res);
      assert.equal(res.statusCode,400);assert.equal(res.body.code,'REGISTRATION_VALIDATION_FAILED');
      assert.ok(res.body.fieldErrors[key]);assert.equal(sideEffects,0);
      assert.equal(applicationFailure({status:400,code:res.body.code,data:res.body}).retrySafe,true);
    }
  }
});

test('thrown account, profile and cleanup exceptions return the same neutral receipt without mail effects',async()=>{
  const previous=process.env.BREVO_API_KEY;process.env.BREVO_API_KEY='inert-fixture';
  try {
    for(const outcome of ['create','profile','cleanup']) {
      let mails=0,floor,created=0,deleted=0;
      const client={auth:{admin:{createUser:async()=>{created++;if(outcome==='create')throw Error('private-provider');return {data:{user:{id}}};},deleteUser:async()=>{deleted++;throw Error('private-cleanup');}}},from:()=>({select(){return this;},limit:async()=>({error:null}),upsert:async()=>{if(outcome==='profile')throw Error('private-profile');return {error:{message:'private-upsert'}};}})};
      const handler=createRegisterTradeHandler({createServiceClient:()=>client,rateLimit:allowed,sendAdmin:async()=>{mails++;},sendVerification:async()=>{mails++;},now:()=>0,wait:async ms=>{floor=ms;}});
      const res=response();await handler({method:'POST',headers:{},body:payload()},res);
      assert.equal(created,1);assert.equal(res.statusCode,200);assert.deepEqual(res.body,registrationReceipt());assert.equal(floor,1400);assert.equal(mails,0);assert.equal(deleted,outcome==='cleanup'?1:0);
    }
  }finally{if(previous===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=previous;}
});

test('syntax-only email check returns no existence facts and accepts normalized ordinary email',async()=>{
  const buckets=[];
  const handler=createRegistrationEmailCheckHandler({rateLimit:async x=>{buckets.push(x.bucket);return {allowed:true};}});
  for(const email of ['existing@fixture.invalid','new@fixture.invalid']) {
    const res=response();await handler({method:'POST',headers:{},body:{email}},res);
    assert.deepEqual(res.body,{ok:true,validationOnly:true});assert.equal(res.statusCode,200);
  }
  assert.equal(buckets.length,4);
});

test('new, duplicate, provider failure and unsent-mail outcomes have identical public receipts without touching duplicate accounts',async()=>{
  const previous=process.env.BREVO_API_KEY;process.env.BREVO_API_KEY='inert-fixture';
  try {
    for(const outcome of ['new','duplicate','provider-failure','missing-user','mail-not-sent']) {
      const counts={create:0,profile:0,adminMail:0,verificationMail:0};let floor;
      const client={auth:{admin:{createUser:async()=>{counts.create++;return outcome==='duplicate'?{error:{code:'email_exists'}}:outcome==='provider-failure'?{error:{code:'unexpected_failure'}}:outcome==='missing-user'?{data:{user:null}}:{data:{user:{id}}};}}},from:()=>({select(){return this;},eq(){return this;},limit:async()=>({error:null,data:[]}),upsert:async()=>{counts.profile++;return {};},single:async()=>({data:{id}})})};
      const handler=createRegisterTradeHandler({createServiceClient:()=>client,rateLimit:allowed,sendAdmin:async()=>{counts.adminMail++;},sendVerification:async()=>{counts.verificationMail++;return {sent:outcome!=='mail-not-sent'};},now:()=>0,wait:async ms=>{floor=ms;}});
      const res=response();await handler({method:'POST',headers:{},body:payload()},res);
      assert.equal(res.statusCode,200);assert.deepEqual(res.body,registrationReceipt());assert.equal(floor,1400);
      assert.equal(isConfirmedTradeApplication(res.body),true);
      assert.doesNotMatch(JSON.stringify(res.body),/profile|customerCode|verificationEmailSent|email_exists|access_token|fixture.invalid/);
      if(['duplicate','provider-failure','missing-user'].includes(outcome)) assert.deepEqual(counts,{create:1,profile:0,adminMail:0,verificationMail:0});
      else assert.deepEqual(counts,{create:1,profile:1,adminMail:1,verificationMail:1});
    }
  }finally{if(previous===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=previous;}
});

test('unrecognized server field text cannot become customer guidance or a safe resend',()=>{
  for(const key of ['constructor','__proto__','toString','unknown']) {
    const fieldErrors=JSON.parse(`{"${key}":"private-response"}`);
    assert.equal(safeServerRegistrationFields(fieldErrors),null);
    assert.equal(applicationFailure({status:400,code:'REGISTRATION_VALIDATION_FAILED',data:{error:'Check the highlighted application details.',fieldErrors}}).retrySafe,false);
  }
  const result=applicationFailure({status:400,code:'REGISTRATION_VALIDATION_FAILED',data:{error:'Check the highlighted application details.',fieldErrors:{phone:'Private provider data'}}});
  assert.equal(result.retrySafe,false);assert.doesNotMatch(result.message,/Private/);
  for(const result of [{ok:true},{...registrationReceipt(),instantAccess:true},{...registrationReceipt(),receipt:'wrong'}]) assert.equal(isConfirmedTradeApplication(result),false);
});
