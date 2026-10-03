import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPasswordSignIn, hasFreshPasswordSession } from '../src/lib/passwordSignIn.mjs';
import { createLoginTransport } from '../src/lib/loginTransport.mjs';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const session = (seconds = 3600) => ({access_token: `${encode({alg:'HS256',typ:'JWT'})}.${encode({exp:Math.floor(Date.now()/1000)+seconds,sub:'00000000-0000-4000-8000-000000000211'})}.c3ludGhldGlj`, refresh_token:'synthetic-only'});
const provisional = value => ({auth:{signInWithPassword:async()=>({data:{session:value},error:null}),stopAutoRefresh:async()=>{}}});

test('expired or near-expiry provisional tokens never enter the shared write', async () => {
  for (const value of [session(-1), session(30), {access_token:'malformed'}]) {
    let commits=0, marks=0;
    const login=createPasswordSignIn({createProvisional:()=>provisional(value),commitSession:async()=>{commits++;},timeoutMs:50});
    await assert.rejects(login('synthetic@example.invalid','SyntheticOnly',{onCommit:()=>marks++}), /finish safely/);
    assert.equal(commits,0); assert.equal(marks,0);
  }
  assert.equal(hasFreshPasswordSession(session()),true);
});

test('shared SDK initialization hang times out before the noncancellable commit', async () => {
  let entered, commits=0, marks=0;
  const started=new Promise(resolve=>entered=resolve);
  const login=createPasswordSignIn({createProvisional:()=>provisional(session()),prepareCommit:()=>{entered();return new Promise(()=>{});},commitSession:async()=>{commits++;},timeoutMs:30});
  const pending=login('synthetic@example.invalid','SyntheticOnly',{onCommit:()=>marks++});
  await started;
  await assert.rejects(pending,{code:'request_timeout'});
  assert.equal(commits,0); assert.equal(marks,0);
});

test('cancelled shared readiness cannot commit after initialization eventually completes', async () => {
  let release, entered, commits=0;
  const gate=new Promise(resolve=>release=resolve), started=new Promise(resolve=>entered=resolve);
  const controller=new AbortController();
  const login=createPasswordSignIn({createProvisional:()=>provisional(session()),prepareCommit:()=>{entered();return gate;},commitSession:async()=>{commits++;},timeoutMs:100});
  const pending=login('synthetic@example.invalid','SyntheticOnly',{signal:controller.signal});
  await started; controller.abort(); await assert.rejects(pending,{name:'AbortError'});
  release(); await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(commits,0);
});

test('token freshness is rechecked after shared readiness before writing', async () => {
  const started=Date.now(); let now=started, commits=0;
  const login=createPasswordSignIn({createProvisional:()=>provisional(session(65)),prepareCommit:async()=>{now=started+10000;},commitSession:async()=>{commits++;},now:()=>now});
  await assert.rejects(login('synthetic@example.invalid','SyntheticOnly'),/finish safely/);
  assert.equal(commits,0);
});

test('refresh transport bounds stalled response bodies even when fetch ignores abort', async () => {
  const transport=createLoginTransport(async()=>{const response=new Response('{}'); response.arrayBuffer=()=>new Promise(()=>{});return response;},{timeoutMs:25});
  await assert.rejects(transport.fetch('https://critical.example.invalid/auth/v1/token?grant_type=refresh_token'),{code:'request_timeout'});
});


test('real provisional SDK expired-token success is rejected before shared SDK commit', async () => {
  let commits = 0;
  const login = createPasswordSignIn({
    createProvisional: () => createClient('https://critical.example.invalid', 'synthetic-key', {
      global: { fetch: async () => new Response(JSON.stringify({ ...session(-1), expires_in: 3600,
        user: { id: '00000000-0000-4000-8000-000000000211' } }), { headers: { 'Content-Type': 'application/json' } }) },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    commitSession: async () => { commits++; },
  });
  await assert.rejects(login('synthetic@example.invalid', 'SyntheticOnly'), /finish safely/);
  assert.equal(commits, 0);
});
test('real shared SDK stalled startup is cancellable before commit and can later recover', async () => {
  const old = { ...session(-60), expires_at: Math.floor(Date.now()/1000)-60,
    user: { id: '00000000-0000-4000-8000-000000000211' } };
  const values = new Map([['synthetic-startup-test', JSON.stringify(old)]]);
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let refreshCalls = 0, marks = 0;
  const transport = createLoginTransport(async input => {
    if (String(input).includes('grant_type=refresh_token')) {
      refreshCalls++;
      if (refreshCalls === 1) return new Promise(() => {});
      return new Response(JSON.stringify({ message: 'Synthetic refresh rejected', code: 'refresh_token_not_found' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(old.user), { headers: { 'Content-Type': 'application/json' } });
  }, { timeoutMs: 20 });
  const shared = createClient('https://critical.example.invalid', 'synthetic-key', {
    global: { fetch: transport.fetch },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
      storage, storageKey: 'synthetic-startup-test' },
  });
  const fresh = session();
  const login = createPasswordSignIn({ createProvisional: () => provisional(fresh),
    prepareCommit: () => shared.auth.initialize(),
    commitSession: value => transport.commit(() => shared.auth.setSession(value)), timeoutMs: 30 });
  try {
    await assert.rejects(login('synthetic@example.invalid', 'SyntheticOnly', { onCommit: () => marks++ }),
      { code: 'request_timeout' });
    assert.equal(marks, 0);
    await shared.auth.initialize();
    const result = await login('synthetic@example.invalid', 'SyntheticOnly', { onCommit: () => marks++ });
    assert.equal(result.session.access_token, fresh.access_token);
    assert.equal(marks, 1);
    assert.equal(refreshCalls, 2);
  } finally { await shared.auth.stopAutoRefresh(); }
});
