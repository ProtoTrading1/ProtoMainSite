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
  await assert.rejects(pending,{code:'REQUEST_TIMEOUT'});
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
  await assert.rejects(transport.fetch('https://critical.example.invalid/auth/v1/token?grant_type=refresh_token'),{code:'REQUEST_TIMEOUT'});
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
      { code: 'REQUEST_TIMEOUT' });
    assert.equal(marks, 0);
    await shared.auth.initialize();
    const result = await login('synthetic@example.invalid', 'SyntheticOnly', { onCommit: () => marks++ });
    assert.equal(result.session.access_token, fresh.access_token);
    assert.equal(marks, 1);
    assert.equal(refreshCalls, 2);
  } finally { await shared.auth.stopAutoRefresh(); }
});

test('dismissed provisional provider success cannot prepare or commit the shared session', async () => {
  let release, entered, prepares = 0, commits = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const controller = new AbortController();
  const login = createPasswordSignIn({
    createProvisional: () => ({ auth: {
      signInWithPassword: async () => { entered(); await gate; return { data: { session: session() }, error: null }; },
      stopAutoRefresh: async () => {},
    } }),
    prepareCommit: async () => { prepares++; },
    commitSession: async () => { commits++; },
  });
  const pending = login('synthetic@example.invalid', 'SyntheticOnly', { signal: controller.signal });
  await started; controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(prepares, 0); assert.equal(commits, 0);
});

test('account change while shared readiness waits rejects the provisional commit', async () => {
  let identity = { userId: 'synthetic-A' }, entered, release, commits = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const login = createPasswordSignIn({
    createProvisional: () => provisional(session()),
    captureOwnership: () => identity,
    assertOwnership: checkpoint => {
      if (checkpoint !== identity) { const error = new Error('Changed'); error.code = 'AUTH_ACCOUNT_CHANGED'; throw error; }
    },
    prepareCommit: async () => { entered(); await gate; },
    commitSession: async () => { commits++; },
  });
  const pending = login('synthetic@example.invalid', 'SyntheticOnly');
  await started;
  identity = { userId: 'synthetic-B' }; identity = { userId: 'synthetic-A' }; release();
  await assert.rejects(pending, { code: 'AUTH_ACCOUNT_CHANGED' });
  assert.equal(commits, 0);
});

test('late verification response body cannot reach the shared SDK after commit deadline', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const transport = createLoginTransport(async () => {
    const response = new Response('{}'); response.arrayBuffer = () => gate; return response;
  }, { timeoutMs: 20 });
  const pending = transport.commit(() => transport.fetch('https://critical.example.invalid/auth/v1/user'));
  await assert.rejects(pending, { code: 'REQUEST_TIMEOUT' });
  release(new TextEncoder().encode('{}'));
  await new Promise(resolve => setTimeout(resolve, 0));
});

test('real shared SDK cannot save a provisional login after a foreign auth event during verification', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let entered, release, identity = { userId: null };
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const transport = createLoginTransport(async () => {
    entered(); await gate;
    return new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000211' }),
      { headers: { 'Content-Type': 'application/json' } });
  });
  const shared = createClient('https://critical.example.invalid', 'synthetic-key', {
    global: { fetch: transport.fetch },
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage, storageKey: 'synthetic-commit-identity' },
  });
  await shared.auth.initialize();
  const events = [];
  const { data: { subscription } } = shared.auth.onAuthStateChange((event, value) => {
    events.push(event);
    if (event !== 'INITIAL_SESSION') identity = { userId: value?.user?.id ?? null };
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  const checkpoint = identity;
  const login = createPasswordSignIn({
    createProvisional: () => provisional(session()),
    prepareCommit: () => shared.auth.initialize(),
    commitSession: value => transport.commit(() => shared.auth.setSession(value), {
      assertOwnership: () => {
        if (identity !== checkpoint) {
          const error = new Error('Your signed-in account changed.'); error.code = 'AUTH_ACCOUNT_CHANGED'; throw error;
        }
      },
    }),
  });
  try {
    const pending = login('synthetic@example.invalid', 'SyntheticOnly');
    await started;
    // This is the same direct subscriber path used by the SDK's BroadcastChannel
    // listener; it bypasses the local SDK auth lock.
    await shared.auth._notifyAllSubscribers('SIGNED_IN', { user: { id: 'synthetic-foreign-account' } }, false);
    release();
    await assert.rejects(pending, { code: 'AUTH_ACCOUNT_CHANGED' });
    assert.equal(values.has('synthetic-commit-identity'), false);
    assert.deepEqual(events, ['INITIAL_SESSION', 'SIGNED_IN']);
  } finally { subscription.unsubscribe(); await shared.auth.stopAutoRefresh(); }
});

test('real shared SDK cannot save a late refresh after a foreign account event', async () => {
  const realNow = Date.now;
  const old = { ...session(), expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '00000000-0000-4000-8000-000000000211' } };
  const values = new Map([['synthetic-refresh-identity', JSON.stringify(old)]]);
  let identity = { userId: old.user.id }, entered, release;
  const checkpoint = identity;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const transport = createLoginTransport(async () => {
    entered(); await gate;
    return new Response(JSON.stringify({ ...old, expires_in: 3600 }),
      { headers: { 'Content-Type': 'application/json' } });
  }, {
    captureOwnership: () => identity,
    assertOwnership: owned => {
      if (identity !== owned) { const error = new Error('Your signed-in account changed.'); error.code = 'AUTH_ACCOUNT_CHANGED'; throw error; }
    },
  });
  const shared = createClient('https://critical.example.invalid', 'synthetic-key', {
    global: { fetch: transport.fetch },
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage, storageKey: 'synthetic-refresh-identity' },
  });
  await shared.auth.initialize();
  const events = [];
  const { data: { subscription } } = shared.auth.onAuthStateChange((event, value) => {
    events.push(event);
    if (event !== 'INITIAL_SESSION') identity = { userId: value?.user?.id ?? null };
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  try {
    const pending = shared.auth.refreshSession();
    await started;
    const foreign = { ...old, access_token: 'synthetic-foreign-token', user: { id: 'synthetic-foreign-account' } };
    storage.setItem('synthetic-refresh-identity', JSON.stringify(foreign));
    await shared.auth._notifyAllSubscribers('SIGNED_IN', foreign, false);
    // End the SDK's native retry budget without waiting through its backoff.
    Date.now = () => realNow() + 60000;
    release();
    const result = await pending;
    assert.ok(result.error);
    assert.notEqual(identity, checkpoint);
    assert.equal(identity.userId, foreign.user.id);
    assert.equal(JSON.parse(values.get('synthetic-refresh-identity')).user.id, foreign.user.id);
    assert.deepEqual(events, ['INITIAL_SESSION', 'SIGNED_IN']);
  } finally { Date.now = realNow; subscription.unsubscribe(); await shared.auth.stopAutoRefresh(); }
});

test('real shared SDK refresh retries retain their original account after a transient 503', async () => {
  const realNow = Date.now;
  const old = { ...session(), expires_at: Math.floor(realNow() / 1000) + 3600,
    user: { id: '00000000-0000-4000-8000-000000000211' } };
  const values = new Map([['synthetic-refresh-retry-owner', JSON.stringify(old)]]);
  let identity = { userId: old.user.id }, entered, calls = 0;
  const started = new Promise(resolve => { entered = resolve; });
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const transport = createLoginTransport(async () => {
    calls++;
    // The event runs after the first 503 body was consumed, during the SDK's
    // retry backoff. It therefore tests the next dispatch's original owner.
    if (calls === 1) setTimeout(entered, 0);
    return calls === 1 ? new Response('{}', { status: 503 })
      : new Response(JSON.stringify({ ...old, expires_in: 3600 }), { headers: { 'Content-Type': 'application/json' } });
  }, {
    captureOwnership: () => identity,
    assertOwnership: owned => {
      if (identity !== owned) {
        Date.now = () => realNow() + 60000;
        const error = new Error('Your signed-in account changed.'); error.code = 'AUTH_ACCOUNT_CHANGED'; throw error;
      }
    },
  });
  const shared = createClient('https://critical.example.invalid', 'synthetic-key', {
    global: { fetch: transport.fetch },
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage, storageKey: 'synthetic-refresh-retry-owner' },
  });
  await shared.auth.initialize();
  const events = [];
  const { data: { subscription } } = shared.auth.onAuthStateChange((event, value) => {
    events.push(event);
    if (event !== 'INITIAL_SESSION') identity = { userId: value?.user?.id ?? null };
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  try {
    const pending = shared.auth.refreshSession();
    await started;
    const foreign = { ...old, user: { id: 'synthetic-foreign-account' } };
    storage.setItem('synthetic-refresh-retry-owner', JSON.stringify(foreign));
    await shared.auth._notifyAllSubscribers('SIGNED_IN', foreign, false);
    assert.ok((await pending).error);
    assert.equal(calls, 1, 'the SDK retry is rejected before another old-account request is sent');
    assert.equal(JSON.parse(values.get('synthetic-refresh-retry-owner')).user.id, foreign.user.id);
    assert.deepEqual(events, ['INITIAL_SESSION', 'SIGNED_IN']);
  } finally { Date.now = realNow; subscription.unsubscribe(); await shared.auth.stopAutoRefresh(); }
});
