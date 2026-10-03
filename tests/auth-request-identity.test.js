import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let sequence=0;
async function fixture() {
  const supabase={auth:{}};
  globalThis.__authIdentityUnitSupabase=supabase;
  const source=(await readFile(new URL('../src/lib/authHeaders.js',import.meta.url),'utf8'))
    .replace("import { supabase } from './supabase';",'const supabase=globalThis.__authIdentityUnitSupabase;');
  const auth=await import(`data:text/javascript;base64,${Buffer.from(source+`\n// isolated ${sequence++}`).toString('base64')}`);
  return {auth,supabase};
}
const a={user:{id:'synthetic-A'},access_token:'synthetic-A'},b={user:{id:'synthetic-B'},access_token:'synthetic-B'};

test('authenticated GET rejects a late 401 after account change before refresh or retry', async()=>{
  const {auth,supabase}=await fixture();let entered,release,refreshes=0;
  const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  supabase.auth.refreshSession=async()=>{refreshes++;return {data:{session:b},error:null};};
  const original=globalThis.fetch,sent=[];
  globalThis.fetch=async(_url,init)=>{sent.push(init.headers.Authorization);entered();await gate;return new Response('{}',{status:401});};
  try {
    auth.rememberAuthSession(a);
    const pending=auth.authenticatedGetJson('/api/synthetic-proof');
    await started;auth.rememberAuthSession(b);release();
    await assert.rejects(pending,{code:'AUTH_ACCOUNT_CHANGED'});
    assert.deepEqual(sent,['Bearer synthetic-A']);assert.equal(refreshes,0);
    assert.equal((await auth.authHeaders()).Authorization,'Bearer synthetic-B');
  } finally {globalThis.fetch=original;}
});

test('identity epoch rejects A-to-B-to-A but permits same-user token changes', async()=>{
  const {auth}=await fixture();
  auth.rememberAuthSession(a);const identity=auth.captureAuthIdentity();
  auth.rememberAuthSession({...a,access_token:'synthetic-A-new'});
  assert.doesNotThrow(()=>auth.assertAuthIdentity(identity));
  auth.rememberAuthSession(b);auth.rememberAuthSession(a);
  assert.throws(()=>auth.assertAuthIdentity(identity),{code:'AUTH_ACCOUNT_CHANGED'});
});

test('authenticated GET rejects delayed body completion after logout', async()=>{
  const {auth}=await fixture();let entered,release;
  const started=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const original=globalThis.fetch;
  globalThis.fetch=async()=>{const response=new Response('{}');response.json=async()=>{entered();await gate;return {synthetic:'old account payload'};};return response;};
  try {
    auth.rememberAuthSession(a);
    const pending=auth.authenticatedGetJson('/api/synthetic-proof');
    await started;auth.rememberAuthSession(null);release();
    await assert.rejects(pending,{code:'AUTH_ACCOUNT_CHANGED'});
  } finally {globalThis.fetch=original;}
});

test('cold SDK session restoration binds ownership before the first authenticated fetch', async()=>{
  const {auth,supabase}=await fixture();
  supabase.auth.getSession=async()=>({data:{session:a},error:null});
  const original=globalThis.fetch,sent=[];
  globalThis.fetch=async(_url,init)=>{sent.push(init.headers.Authorization);return new Response(JSON.stringify({synthetic:'A'}));};
  try {
    const result=await auth.authenticatedGetJson('/api/synthetic-proof');
    assert.deepEqual(result.data,{synthetic:'A'});
    assert.deepEqual(sent,['Bearer synthetic-A']);
  } finally {globalThis.fetch=original;}
});

test('explicit profile tokens cannot replace the remembered account token', async () => {
  const { auth } = await fixture();
  auth.rememberAuthSession(b);
  const identity = auth.captureAuthIdentity();
  assert.equal((await auth.authHeaders(a)).Authorization, 'Bearer synthetic-A');
  assert.equal((await auth.authHeaders('synthetic-profile-token')).Authorization, 'Bearer synthetic-profile-token');
  assert.equal((await auth.authHeaders()).Authorization, 'Bearer synthetic-B');
  assert.equal(auth.captureAuthIdentity(), identity);
});

test('cold delayed session read cannot adopt an account after A-to-B-to-A events', async () => {
  const { auth, supabase } = await fixture();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  supabase.auth.getSession = async () => { entered(); await gate; return { data: { session: a } }; };
  const pending = auth.authHeaders();
  await started;
  auth.rememberAuthSession(a); auth.rememberAuthSession(b); auth.rememberAuthSession(a);
  release();
  await assert.rejects(pending, { code: 'AUTH_ACCOUNT_CHANGED' });
  assert.equal((await auth.authHeaders()).Authorization, 'Bearer synthetic-A');
});

test('late same-user session snapshot cannot overwrite a refreshed token', async () => {
  const { auth, supabase } = await fixture();
  auth.rememberAuthSession(a);
  const identity = auth.captureAuthIdentity();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  supabase.auth.refreshSession = async () => { entered(); await gate; return { data: { session: a } }; };
  const pending = auth.refreshAuthHeaders({}, identity);
  await started;
  auth.rememberAuthSession({ ...a, access_token: 'synthetic-A-latest' });
  release();
  assert.equal((await pending).Authorization, 'Bearer synthetic-A-latest');
  assert.equal((await auth.authHeaders()).Authorization, 'Bearer synthetic-A-latest');
});

test('401 refresh rejects A-to-B-to-A before it can replace the current token', async () => {
  const { auth, supabase } = await fixture();
  auth.rememberAuthSession(a);
  const identity = auth.captureAuthIdentity();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  supabase.auth.refreshSession = async () => { entered(); await gate; return { data: { session: a } }; };
  const pending = auth.refreshAuthHeaders({}, identity);
  await started;
  auth.rememberAuthSession(b); auth.rememberAuthSession({ ...a, access_token: 'synthetic-A-returned' });
  release();
  await assert.rejects(pending, { code: 'AUTH_ACCOUNT_CHANGED' });
  assert.equal((await auth.authHeaders()).Authorization, 'Bearer synthetic-A-returned');
});
