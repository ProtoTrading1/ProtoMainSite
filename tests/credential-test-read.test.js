import test from 'node:test';
import assert from 'node:assert/strict';
import { credentialTestReadHandler, FIXTURE_SKUS, validCredentialTestScope, renderCredentialTestRead, credentialTestScopeFailure } from '../lib/credential-test-read.mjs';
import { createStockClient } from '../lib/stock-supabase.mjs';
const env = { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'codex/release-storefront-acceptance-20261019', PREVIEW_READ_ONLY: '1', STOCK_SUPABASE_POOLER_URL: 'https://pyrwimlmmruxtuxhdsom.supabase.co', STOCK_SUPABASE_KEY: 'sb_secret_SYNTHETIC_FIXTURE_1234567890' };
const rows = () => FIXTURE_SKUS.map((sku,i) => ({ sku, price: '11.50', stock_qty: i===2?'0':20, available_stock: i===2?0:-2 }));
function response() { return { headers:{}, setHeader(k,v){this.headers[k]=v;}, status(c){this.code=c;return this;}, json(v){this.body=v;return this;} }; }
function fake(data=rows(), error=null, status=200) { const calls=[];const q={select(v){calls.push(['select',v]);return this;},in(k,v){calls.push(['in',k,v]);return this;},limit(v){calls.push(['limit',v]);return this;},retry(enabled){assert.equal(enabled,false);return this;},async abortSignal(v){assert.ok(v instanceof AbortSignal);return{data,error,status};}};return{calls,factory(){return{from(t){calls.push(['from',t]);return q;}};}}; }
async function run(mock, e=env, method='GET') { const res=response();await credentialTestReadHandler({env:e,clientFactory:mock.factory})({method,query:{table:'customers',sku:'evil'}},res);return res; }
test('exact scope only, malformed or production scope refuses before client', async()=>{assert.equal(validCredentialTestScope(env),true);for(const change of [{VERCEL_ENV:'production'},{VERCEL_ENV:undefined},{VERCEL_GIT_COMMIT_REF:''},{VERCEL_GIT_COMMIT_REF:'main'},{PREVIEW_READ_ONLY:undefined},{PREVIEW_READ_ONLY:'true'},{STOCK_SUPABASE_KEY:undefined},{STOCK_SUPABASE_KEY:'sb_secret_short'},{STOCK_SUPABASE_KEY:'legacy'},{STOCK_SUPABASE_POOLER_URL:'https://yiqsvwajozafvalwcero.supabase.co'},{STOCK_SUPABASE_POOLER_URL:''}]){const e={...env,...change};assert.equal(validCredentialTestScope(e),false);const mock={factory(){assert.fail('no provider construction');}};assert.equal((await run(mock,e)).code,404);}});
test('mutation methods refused without any client',async()=>{for(const method of ['POST','PATCH','DELETE','HEAD']) assert.equal((await run({factory(){assert.fail('no provider');}},env,method)).code,405);});
test('one fixed Test read and only boolean/count result; other fixture stock unrestricted',async()=>{const mock=fake();const res=await run(mock);assert.equal(res.code,200);assert.deepEqual(res.body,{ok:true,checks:{fixturesPresent:true,pricesMatch:true,frozenZeroStockMatches:true},fixtureCount:3});assert.deepEqual(mock.calls,[['from','website_stock'],['select','sku,price,stock_qty,available_stock'],['in','sku',[...FIXTURE_SKUS]],['limit',4]]);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.ok(!JSON.stringify(res.body).includes(FIXTURE_SKUS[0]));});
test('missing duplicate unexpected or changed price fixture fails',async()=>{for(const data of [rows().slice(0,2),[...rows(),rows()[0]],[rows()[0],rows()[0],rows()[2]],rows().map((r,i)=>i===0?{...r,sku:'other'}:r),rows().map((r,i)=>i===0?{...r,price:12}:r)]){const res=await run(fake(data));assert.equal(res.code,409);assert.equal(res.body.ok,false);}});
test('frozen raw zero rejects false blank null missing and changed values',async()=>{for(const value of [null,'',' ',false,undefined,-1,20]){const data=rows();data[2].stock_qty=value;const res=await run(fake(data));assert.equal(res.code,409);assert.equal(res.body.checks.frozenZeroStockMatches,false);}});
test('provider error details never returned',async()=>{const sensitive=env.STOCK_SUPABASE_KEY+' <script>bad</script>';for(const mock of [fake(null,{message:sensitive}),{factory(){throw new Error(sensitive);}}]){const res=await run(mock);assert.equal(res.code,502);assert.deepEqual(res.body,{ok:false,error:'provider_read_failed'});assert.ok(!JSON.stringify(res).includes(sensitive));}});
test('actual SDK one mocked GET goes to Test root with secret apikey only',async()=>{let count=0;const mock={factory(options){return createStockClient({...options,fetchImpl:async(url,init)=>{count++;const u=new URL(url);assert.equal(u.origin,env.STOCK_SUPABASE_POOLER_URL);assert.equal(u.pathname,'/rest/v1/website_stock');assert.equal(u.searchParams.get('limit'),'4');assert.equal(init.method,'GET');assert.equal(init.headers.get('authorization'),null);assert.equal(init.headers.get('apikey'),env.STOCK_SUPABASE_KEY);return new Response(JSON.stringify(rows()),{status:200,headers:{'content-type':'application/json'}});}});}};assert.equal((await run(mock)).code,200);assert.equal(count,1);});
test('HTML reports fixed text only and cannot echo arbitrary provider fields',()=>{const bad='<script>SECRET</script>';const html=renderCredentialTestRead({ok:false,error:bad,fixtureCount:bad,checks:{fixturesPresent:bad}});assert.ok(!html.includes(bad));assert.ok(!html.includes('<script'));assert.match(html,/Fixtures returned: 0/);assert.match(html,/NOT PASSED/);});

test('scope failures name only the rejected fixed gate', () => {
 for(const [change,reason] of [[{VERCEL_ENV:'sensitive-environment'},'scope_environment'],[{VERCEL_GIT_COMMIT_REF:'sensitive-branch'},'scope_branch'],[{PREVIEW_READ_ONLY:'sensitive-readonly'},'scope_read_only'],[{STOCK_SUPABASE_KEY:'sensitive-key'},'scope_binding'],[{STOCK_SUPABASE_POOLER_URL:'https://yiqsvwajozafvalwcero.supabase.co'},'scope_target']]) {
  assert.equal(credentialTestScopeFailure({...env,...change}),reason);
  const html=renderCredentialTestRead({ok:false,error:reason});
  for(const value of Object.values(change)) assert.ok(!html.includes(value));
 }
});
test('provider status classification exposes fixed labels only', async () => {
 for(const [status,error,label] of [[401,'provider_auth_failed','Test provider rejected the credential'],[403,'provider_permission_denied','Test provider denied table access'],[500,'provider_read_failed','Test provider read failed']]) {
  const res=await run(fake(null,{message:env.STOCK_SUPABASE_KEY+' provider detail'},status));
  assert.equal(res.body.error,error);assert.equal(res.code,502);const html=renderCredentialTestRead(res.body);assert.ok(html.includes(label));assert.ok(!html.includes(env.STOCK_SUPABASE_KEY));assert.ok(!html.includes('provider detail'));
 }
 const html=renderCredentialTestRead({ok:false,error:'toString',message:'SECRET'});assert.ok(html.includes('Synthetic fixture checks did not pass'));assert.ok(!html.includes('SECRET'));assert.ok(!html.includes('function'));
});

test('SDK transient failure and network error each consume exactly one provider attempt', async () => {
 for (const mode of ['503','network']) {
  let calls=0;
  const mock={factory(options){return createStockClient({...options,fetchImpl:async()=>{
   calls++;
   if(mode==='network')throw new Error('SYNTHETIC_NETWORK_FAILURE');
   return new Response(JSON.stringify({message:'SYNTHETIC_TEMPORARY_FAILURE'}),{status:503,headers:{'content-type':'application/json'}});
  }});}};
  const res=await run(mock);
  assert.equal(res.code,502);assert.equal(res.body.error,'provider_read_failed');assert.equal(calls,1);
 }
});
test('release and former Test branches cannot use the acceptance-only guard or legacy fallback', () => {
 for(const branch of ['codex/release-storefront-credentials-20261019','codex/stock-credentials-test-20261019']) assert.equal(validCredentialTestScope({...env,VERCEL_GIT_COMMIT_REF:branch}),false);
 assert.equal(validCredentialTestScope({...env,STOCK_SUPABASE_KEY:undefined,VITE_STOCK_SUPABASE_URL:'https://yiqsvwajozafvalwcero.supabase.co',VITE_STOCK_SUPABASE_KEY:'legacy_synthetic'}),false);
});
test('actual HTTP wrapper serves fixed static HTML and refuses Production before transport', async () => {
 const saved=process.env.VERCEL_ENV;const originalFetch=globalThis.fetch;
 try {
  process.env.VERCEL_ENV='production';globalThis.fetch=()=>assert.fail('Production must not read a provider');
  const {default:handler}=await import('../api/credential-test-read.js');
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},end(body){this.body=body;return this;}};
  await handler({method:'GET'},res);
  assert.equal(res.code,404);assert.match(res.headers['Content-Type'],/^text\/html/);assert.match(res.headers['Content-Security-Policy'],/default-src 'none'/);assert.match(res.body,/Preview environment required/);assert.ok(!res.body.includes('<script'));
 } finally {globalThis.fetch=originalFetch;if(saved===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=saved;}
});
