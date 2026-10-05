import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import { createRegisterTradeHandler } from '../api/register-trade.js';
import { verifyTradeEmail, sendTradeVerificationEmail } from '../api/_trade-email-verification.js';
import { createVerifyTradeEmailHandler } from '../api/verify-trade-email.js';
import { createResendTradeVerificationHandler } from '../api/resend-trade-verification.js';
import { getApprovedCustomer } from '../api/_auth.js';

const id='10000000-0000-4000-8000-000000000001';
const token='a'.repeat(64);
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;},end(){return this;}});
const user={id,email:'buyer@company.co.za',email_confirmed_at:'2026-10-03T12:00:00Z'};
const allowed=async()=>({allowed:true});

test('installed Auth SDK preserves generated magiclink proof and separate service authorization', async () => {
  const requests = [];
  const sessionToken = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    requests.push({ path, body: JSON.parse(options.body), authorization: new Headers(options.headers).get('Authorization') });
    let payload;
    if (path.endsWith('/admin/generate_link')) payload = { ...user, hashed_token: token, verification_type: 'magiclink', action_link: 'http://127.0.0.1/synthetic-only' };
    else if (path.endsWith('/verify')) payload = { user, access_token: sessionToken, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer' };
    else if (path.endsWith('/rpc/complete_trade_email_verification')) payload = { verified: true, approved: true };
    else throw new Error(`Unexpected synthetic SDK request: ${path}`);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } };
  const serviceClient = createClient('http://127.0.0.1:1', 'synthetic-service', options);
  const verifyClient = createClient('http://127.0.0.1:1', 'synthetic-anon', options);
  const generated = await serviceClient.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  assert.equal(generated.error, null);
  assert.equal(generated.data.properties.hashed_token, token);
  assert.equal(generated.data.properties.verification_type, 'magiclink');
  assert.deepEqual(await verifyTradeEmail({ tokenHash: token, verifyClient, serviceClient }), { ok: true, verified: true, approved: true });
  assert.equal(requests[0].body.type, 'magiclink');
  assert.equal(requests[1].body.type, 'magiclink');
  assert.equal(requests[1].body.token_hash, token);
  assert.equal(requests[1].authorization, 'Bearer synthetic-anon');
  assert.equal(requests[2].authorization, 'Bearer synthetic-service');
  assert.deepEqual(requests[2].body, { p_user_id: id });
});

test('catalogue API access requires completed mailbox proof even after staff approval', async () => {
  const pending = { id, role: 'customer', is_approved: true, trade_email_verification_required: true, trade_email_verified_at: null };
  const cases = [
    [pending, false],
    [{ ...pending, trade_email_verified_at: '2026-10-03T12:00:00Z' }, true],
    [{ ...pending, trade_email_verification_required: false }, true],
    [{ ...pending, role: 'admin' }, true],
    [{ ...pending, is_approved: false, trade_email_verified_at: '2026-10-03T12:00:00Z' }, false],
  ];
  for (const [customer, approved] of cases) {
    const chain = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: customer }; } };
    const res = response();
    const result = await getApprovedCustomer(user, res, { from: () => chain });
    assert.equal(Boolean(result), approved);
    if (!approved) assert.equal(res.statusCode, 403);
    if (customer === pending) assert.equal(res.body.code, 'TRADE_EMAIL_VERIFICATION_REQUIRED');
  }
});

test('registration never auto-approves an unverified legacy email, and sends no proof in response',async()=>{
  const prior=process.env.BREVO_API_KEY;process.env.BREVO_API_KEY='synthetic-key';
  try {
    let created;let profile;let verification=0;
    const client={auth:{admin:{createUser:async(options)=>{created=options;return {data:{user:{id,email:user.email}}};}}},from(table){
      assert.equal(table,'customers','legacy details are not read before verification');
      return {select(){return this;},limit:async()=>({data:[],error:null}),eq(){return this;},upsert:async(row)=>{profile=row;return {};},single:async()=>({data:{id,email:user.email,is_approved:false,customer_code:null}})};
    }};
    const handler=createRegisterTradeHandler({createServiceClient:()=>client,rateLimit:allowed,sendAdmin:async()=>{},sendVerification:async(args)=>{verification++;assert.equal(args.userId,id);return {sent:true};}});
    const res=response();
    await handler({method:'POST',headers:{},body:{email:user.email,password:'LongStrongPassword7!',contactName:'Buyer',businessName:'Buyer business',phone:'0825550123',country:'South Africa',streetName:'1 Synthetic Road',suburb:'Fixture Suburb',city:'Fixture City',postalCode:'0001',buildingType:'House',acceptWhatsapp:false,companyAddress:'Synthetic address',deliveryAddress:'Synthetic address',salesChannels:['Physical retail store'],productCategories:['Gifts & novelty products'],businessDescription:'A synthetic registered trading business.',customerCode:'ABC123'}},res);
    assert.equal(res.statusCode,200);assert.equal(created.email_confirm,false);
    assert.deepEqual(created.app_metadata,{trade_email_verification_required:true});
    assert.equal(profile.is_approved,false);assert.equal(profile.trade_email_verification_required,true);
    assert.equal(profile.sales_last_12_months,null);assert.equal(profile.customer_code,null);
    assert.equal(res.body.instantAccess,false);assert.equal(res.body.emailVerificationRequired,true);
    assert.equal(res.body.receipt,'CHECK_EMAIL_OR_SIGN_IN');assert.equal(verification,1);assert.equal(res.body.verificationEmailSent,undefined);
    assert.doesNotMatch(JSON.stringify(res.body),/token_hash|access_token|synthetic-key/);
  }finally{if(prior===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=prior;}
});

test('one-time Auth proof must succeed before the service callback can grant access',async()=>{
  let callbacks=0;
  const serviceClient={rpc:async(name,args)=>{callbacks++;assert.equal(name,'complete_trade_email_verification');assert.equal(args.p_user_id,id);return {data:{verified:true,approved:true}};}};
  const invalid={auth:{verifyOtp:async()=>({error:{message:'expired'},data:null})}};
  await assert.rejects(verifyTradeEmail({tokenHash:token,verifyClient:invalid,serviceClient}),/expired/);
  assert.equal(callbacks,0);
  const valid={auth:{verifyOtp:async(params)=>{assert.deepEqual(params,{token_hash:token,type:'magiclink'});return {data:{user,session:{access_token:'synthetic-session'}}};}}};
  assert.deepEqual(await verifyTradeEmail({tokenHash:token,verifyClient:valid,serviceClient}),{ok:true,verified:true,approved:true});
  assert.equal(callbacks,1);
});

test('failed profile finalization is actionable and does not return a session or approval',async()=>{
  const verifyClient={auth:{verifyOtp:async()=>({data:{user,session:{access_token:'synthetic-session'}}})}};
  await assert.rejects(verifyTradeEmail({tokenHash:token,verifyClient,serviceClient:{rpc:async()=>({error:{message:'missing schema'}})}}),error=>error.status===503&&/Request another/.test(error.message));
});

test('verification is POST-only, bounded by rate limit, and discards provider details',async()=>{
  const handler=createVerifyTradeEmailHandler({rateLimit:async()=>({allowed:false}),tokenClient:()=>{throw Error('not called');},serviceClient:()=>{throw Error('not called');}});
  let res=response(); await handler({method:'GET',headers:{}},res);assert.equal(res.statusCode,405);
  res=response();await handler({method:'POST',headers:{},body:{tokenHash:token}},res);assert.equal(res.statusCode,429);
});

test('resend does not create a user for an unknown email or resend completed verification',async()=>{
  for(const profile of [null,{id,email:user.email,trade_email_verification_required:true,trade_email_verified_at:'2026-10-03'}]){
    let sent=0;const chain={select(){return this;},eq(){return this;},async maybeSingle(){return {data:profile};}};
    const handler=createResendTradeVerificationHandler({rateLimit:allowed,client:()=>({from:()=>chain}),send:async()=>{sent++;}});
    const res=response();await handler({method:'POST',headers:{},body:{email:user.email}},res);
    assert.deepEqual(res.body,{ok:true});assert.equal(sent,0);
  }
});

test('mock verification email stays on the expected identity and contains the proof only in email',async()=>{
  const prior=process.env.BREVO_API_KEY;process.env.BREVO_API_KEY='synthetic-key';
  try {
    let payload;
    const client={auth:{admin:{generateLink:async()=>({data:{user,properties:{hashed_token:token}}})}}};
    assert.deepEqual(await sendTradeVerificationEmail({client,userId:id,email:user.email,name:'<buyer>',fetcher:async(url,options)=>{assert.equal(url,'https://api.brevo.com/v3/smtp/email');payload=JSON.parse(options.body);return {ok:true};}}),{sent:true});
    assert.match(payload.htmlContent,/#\/verify-email\?token_hash=/);assert.match(payload.htmlContent,/&lt;buyer&gt;/);
    await assert.rejects(sendTradeVerificationEmail({client,userId:'different',email:user.email,fetcher:()=>{throw Error('must not send');}}),/could not be generated/);
  } finally { if(prior===undefined)delete process.env.BREVO_API_KEY;else process.env.BREVO_API_KEY=prior; }
});
