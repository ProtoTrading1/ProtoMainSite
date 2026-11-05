import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegisterTradeHandler } from '../api/register-trade.js';
import { createTradeApplicationAttempt } from '../src/lib/tradeApplicationAttempt.mjs';
import { submitTradeApplication } from '../src/lib/tradeApplication.js';
import { isConfirmedTradeApplication } from '../src/lib/registrationResult.mjs';

const id = '00000000-0000-4000-8000-000000000007';
const weak = 'This password is too weak or has appeared in a data breach. Choose a stronger, unique password.';
const payload = { email:'synthetic@fixture.invalid', password:'1234567890', contactName:'Synthetic Applicant', businessName:'Synthetic Trade', phone:'0825550123', companyAddress:'1 Fixture Road', deliveryAddress:'1 Fixture Road', country:'South Africa', streetName:'1 Fixture Road', suburb:'Fixture Suburb', city:'Fixture City', postalCode:'0001', buildingType:'House', acceptWhatsapp:false, salesChannels:['Physical retail store'], productCategories:['Gifts & novelty products'], businessDescription:'Synthetic gifts supplied to local shops.' };
const response = () => ({statusCode:200,status(n){this.statusCode=n;return this;},setHeader(){},json(body){this.body=body;return this;},end(){return this;}});

function fixture(outcome) {
  const effects={create:0,profile:0,admin:0,mail:0,deleted:0};
  const client={auth:{admin:{async createUser(){
    effects.create++;
    if(outcome==='throw')throw Error('private provider detail');
    if(outcome && typeof outcome==='object')return {error:outcome};
    return {data:{user:outcome==='missing-user'?null:{id}}};
  },async deleteUser(){effects.deleted++;}}},from(){return {
    select(){return this;},eq(){return this;},async limit(){return {data:[],error:null};},
    async upsert(){effects.profile++;return outcome==='profile-failure'?{error:{message:'private'}}:{};},
    async single(){return {data:outcome==='readback-failure'?null:{id}};},
  };}};
  const handler=createRegisterTradeHandler({createServiceClient:()=>client,rateLimit:async()=>({allowed:true}),
    sendAdmin:async()=>{effects.admin++;},sendVerification:async()=>{effects.mail++;if(outcome==='mail-throw')throw Error('private mail');return {sent:outcome!=='mail-rejected'};},wait:async()=>{}});
  return {handler,effects};
}

test('provider password rejection is actionable, retryable and has no customer or mail side effects',async t=>{
  const previous=process.env.BREVO_API_KEY;process.env.BREVO_API_KEY='synthetic-inert';
  t.after(()=>{if(previous===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=previous;});
  for(const error of [{code:'weak_password'},{name:'AuthWeakPasswordError'}, {status:422,message:'Password is known to be weak and easy to guess, please choose a different one.'}]) {
    const {handler,effects}=fixture(error);const res=response();
    await handler({method:'POST',headers:{},body:payload},res);
    assert.equal(res.statusCode,400);assert.equal(res.body.code,'REGISTRATION_VALIDATION_FAILED');
    assert.equal(res.body.fieldErrors.password,weak);assert.equal(isConfirmedTradeApplication(res.body),false);
    assert.deepEqual(effects,{create:1,profile:0,admin:0,mail:0,deleted:0});
    const values=new Map();let sends=0;
    const attempt=createTradeApplicationAttempt({storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},send:async()=>{
      sends++;if(sends===1)throw Object.assign(Error('private'),{status:400,code:res.body.code,data:res.body});
      return {ok:true,receipt:'REGISTRATION_SUCCEEDED',instantAccess:false,emailVerificationRequired:true};
    }});
    await assert.rejects(attempt.submit(payload),e=>e.retrySafe===true && e.fieldErrors.password===weak);
    assert.equal(attempt.state,'idle');assert.equal(values.size,0);
    await attempt.submit({...payload,password:'A stronger synthetic password!'});assert.equal(attempt.state,'confirmed');
  }
});

test('only created accounts with saved profiles and accepted confirmation mail receive success',async t=>{
  const previous=process.env.BREVO_API_KEY;process.env.BREVO_API_KEY='synthetic-inert';
  t.after(()=>{if(previous===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=previous;});
  for(const outcome of [null,{code:'email_exists'},{code:'unexpected_failure'},'throw','missing-user','profile-failure','readback-failure','mail-rejected','mail-throw']) {
    const {handler,effects}=fixture(outcome);const res=response();
    await handler({method:'POST',headers:{},body:payload},res);
    assert.equal(isConfirmedTradeApplication(res.body),outcome===null,JSON.stringify(outcome));
    assert.equal(res.statusCode===200,outcome===null);
    assert.doesNotMatch(JSON.stringify(res.body),/private|token|synthetic-inert/);
    if(outcome===null)assert.deepEqual(effects,{create:1,profile:1,admin:1,mail:1,deleted:0});
  }
});

test('every registration caller rejects legacy or malformed HTTP 200 receipts',async t=>{
  for(const result of [{ok:true},{ok:true,receipt:'CHECK_EMAIL_OR_SIGN_IN',instantAccess:false,emailVerificationRequired:true}]) {
    t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(result),{status:200}));
    await assert.rejects(submitTradeApplication(payload),{code:'REGISTRATION_OUTCOME_UNKNOWN'});
  }
});

test('shared client displays the allowlisted password error for every registration form',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:'Check the highlighted application details.',code:'REGISTRATION_VALIDATION_FAILED',fieldErrors:{password:weak}}),{status:400}));
  await assert.rejects(submitTradeApplication(payload),e=>e.message===weak && e.status===400);
});
