import test from 'node:test';
import assert from 'node:assert/strict';
import { createIsolatedSignIn, createSignInCommitTransport, hasFreshSignInSession } from '../src/lib/signInRequest.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const session = () => ({ access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: Date.now() / 1000 + 3600 })).toString('base64url')}.synthetic`, refresh_token: 'inert-refresh', user: { id } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const refreshUrl = 'http://localhost/auth/v1/token?grant_type=refresh_token';

test('refresh response ownership rejects an old identity after headers or body and binds retries', async () => {
  for (const stage of ['headers', 'body']) {
    let identity = { userId: 'A', epoch: 1 }, calls = 0;
    const gate = deferred(), started = deferred();
    const transport = createSignInCommitTransport(async () => {
      calls++;started.resolve();
      if(stage === 'headers') await gate.promise;
      return { status:200, statusText:'OK', headers:{}, arrayBuffer:async()=>{if(stage === 'body') await gate.promise;return new TextEncoder().encode('{}').buffer;} };
    }, { captureOwnership:()=>identity, assertOwnership:owner=>{if(owner!==identity)throw Object.assign(Error('Changed'),{code:'AUTH_ACCOUNT_CHANGED'});} });
    const request={body:JSON.stringify({refresh_token:'refresh-A'})};
    const pending=transport.fetch(refreshUrl,request);
    await started.promise;identity={userId:'B',epoch:2};gate.resolve();
    await assert.rejects(pending,{code:'AUTH_ACCOUNT_CHANGED'});
    identity={userId:'A',epoch:3};
    await assert.rejects(transport.fetch(refreshUrl,request),{code:'AUTH_ACCOUNT_CHANGED'});
    assert.equal(calls,1);
  }
});

test('same-identity refresh and initial cold restore can pass while full-body timeout refuses a late payload', async () => {
  const identity={userId:null,epoch:0};let token='old';
  const transport=createSignInCommitTransport(async()=>{token='new';return new Response('{}');}, {captureOwnership:()=>identity,assertOwnership:owner=>assert.equal(owner,identity)});
  assert.equal((await transport.fetch(refreshUrl,{body:JSON.stringify({refresh_token:'cold'})})).status,200);
  assert.equal(token,'new');
  const body=deferred(),started=deferred();
  const slow=createSignInCommitTransport(async()=>{started.resolve();return {status:200,statusText:'OK',headers:{},arrayBuffer:()=>body.promise};},{refreshTimeoutMs:8,captureOwnership:()=>identity,assertOwnership:owner=>assert.equal(owner,identity)});
  const pending=slow.fetch(refreshUrl,{body:JSON.stringify({refresh_token:'slow'})});
  await started.promise;await assert.rejects(pending,{code:'REQUEST_TIMEOUT'});
  body.resolve(new ArrayBuffer(0));await new Promise(r=>setImmediate(r));
});
function harness(overrides = {}) {
  const counters = { provider: 0, commit: 0, stopped: 0, epoch: 0 };
  const signIn = createIsolatedSignIn({
    createProvisional: () => ({ auth: {
      signInWithPassword: async () => { counters.provider++; return { data: { session: session() }, error: null }; },
      stopAutoRefresh: () => { counters.stopped++; },
    } }),
    prepare: async () => {}, captureOwnership: () => counters.epoch,
    assertOwnership: epoch => { if (epoch !== counters.epoch) throw Object.assign(new Error('Changed'), { code: 'SIGN_IN_SESSION_CHANGED' }); },
    commitSession: async value => { counters.commit++; return { data: { session: value }, error: null }; },
    ...overrides,
  });
  return { signIn, counters };
}

test('only fresh session with matching token subject permits shared commit', async () => {
  const { signIn, counters } = harness(); let commits = 0;
  const result = await signIn('synthetic@fixture.invalid', 'memory-only', { onCommit: () => { commits++; } });
  assert.equal(result.session.user.id, id); assert.equal(counters.commit, 1); assert.equal(commits, 1); assert.equal(counters.stopped, 1);
  for (const value of [null, {}, { ...session(), user: { id: 'other' } }, { ...session(), refresh_token: '' }]) assert.equal(hasFreshSignInSession(value), false);
});

test('invalid/no-session responses never announce or commit sign-in', async () => {
  for (const value of [null, {}, { ...session(), user: { id: 'other' } }]) {
    const { signIn, counters } = harness({ createProvisional: () => ({ auth: { signInWithPassword: async () => ({ data: { session: value }, error: null }), stopAutoRefresh: () => {} } }) });
    await assert.rejects(signIn('synthetic@fixture.invalid', 'inert'), { code: 'SIGN_IN_INVALID_SESSION' }); assert.equal(counters.commit, 0);
  }
});

test('cancel before provider response suppresses a late result even when provider ignores signal', async () => {
  const wait = deferred(); const started = deferred(); const controller = new AbortController();
  const { signIn, counters } = harness({ createProvisional: () => ({ auth: { signInWithPassword: () => { started.resolve(); return wait.promise; }, stopAutoRefresh: () => {} } }) });
  const pending = signIn('synthetic@fixture.invalid', 'inert', { signal: controller.signal });
  await started.promise; controller.abort(); await assert.rejects(pending, { code: 'REQUEST_CANCELLED' });
  wait.resolve({ data: { session: session() }, error: null }); await new Promise(r => setImmediate(r)); assert.equal(counters.commit, 0);
});

test('provider timeout and slow initialization cannot commit a late session', async () => {
  for (const kind of ['provider', 'initialize']) {
    const wait = deferred(); let commits = 0;
    const { signIn } = harness({ timeoutMs: 8, prepare: kind === 'initialize' ? () => wait.promise : async () => {},
      createProvisional: () => ({ auth: { signInWithPassword: () => wait.promise, stopAutoRefresh: () => {} } }), commitSession: async () => { commits++; } });
    await assert.rejects(signIn('synthetic@fixture.invalid', 'inert'), { code: 'REQUEST_TIMEOUT' });
    wait.resolve({ data: { session: session() }, error: null }); await new Promise(r => setImmediate(r)); assert.equal(commits, 0);
  }
});

test('another auth event while provider runs invalidates its ownership', async () => {
  const wait = deferred(); const started = deferred();
  const { signIn, counters } = harness({ createProvisional: () => ({ auth: { signInWithPassword: () => { started.resolve(); return wait.promise; }, stopAutoRefresh: () => {} } }) });
  const pending = signIn('synthetic@fixture.invalid', 'inert'); await started.promise; counters.epoch++;
  wait.resolve({ data: { session: session() }, error: null });
  await assert.rejects(pending, { code: 'SIGN_IN_SESSION_CHANGED' }); assert.equal(counters.commit, 0);
});

test('a superseding password attempt prevents the earlier result from committing', async () => {
  const first = deferred(); const started = deferred(); let requests = 0; let commits = 0;
  const { signIn } = harness({ createProvisional: () => ({ auth: { signInWithPassword: async () => { requests++; if (requests === 1) { started.resolve(); return first.promise; } return { data: { session: session() }, error: null }; }, stopAutoRefresh: () => {} } }),
    commitSession: async value => { commits++; return { data: { session: value }, error: null }; } });
  const pending = signIn('synthetic@fixture.invalid', 'inert'); await started.promise;
  await signIn('synthetic@fixture.invalid', 'inert'); first.resolve({ data: { session: session() }, error: null });
  await assert.rejects(pending, { code: 'SIGN_IN_SESSION_CHANGED' }); assert.equal(commits, 1);
});

test('shared SDK verification waits for body and checks ownership before exposing it', async () => {
  const body = deferred(); const headers = deferred(); let valid = true;
  const value = session();
  const transport = createSignInCommitTransport(async () => { headers.resolve(); return { arrayBuffer: () => body.promise, status: 200, statusText: 'OK', headers: {} }; });
  let stored = 0;
  const pending = transport.commit(value, async () => {
    await transport.fetch('http://localhost/auth/v1/user', { headers: { Authorization: `Bearer ${value.access_token}` } }); stored++; return { data: { session: value } };
  }, () => { if (!valid) throw new Error('Session changed'); });
  await headers.promise; valid = false; body.resolve(new ArrayBuffer(0));
  await assert.rejects(pending, { code: 'SIGN_IN_COMMIT_FAILED' }); assert.equal(stored, 0);
});

test('confirmed commit leaves ordinary shared user reads and updates available', async () => {
  const methods = []; const value = session();
  const transport = createSignInCommitTransport(async (_input, init) => { methods.push(init.method || 'GET'); return new Response('{}'); });
  await transport.commit(value, async () => {
    await transport.fetch('http://localhost/auth/v1/user', { headers: { Authorization: `Bearer ${value.access_token}` } });
    return { data: { session: value }, error: null };
  }, () => {});
  await transport.fetch('http://localhost/auth/v1/user', { headers: { Authorization: `Bearer ${value.access_token}` } });
  await transport.fetch('http://localhost/auth/v1/user', { method: 'PATCH', headers: { Authorization: `Bearer ${value.access_token}` } });
  assert.deepEqual(methods, ['GET', 'GET', 'PATCH']);
});

test('shared commit timeout refuses a late queued SDK verification', async () => {
  const wait = deferred(); const value = session(); let stored = 0; let late;
  const transport = createSignInCommitTransport(async () => new Response('{}'), { timeoutMs: 8 });
  const pending = transport.commit(value, async () => {
    await wait.promise;
    late = transport.fetch('http://localhost/auth/v1/user', { headers: { Authorization: `Bearer ${value.access_token}` } });
    await late; stored++; return {};
  }, () => {});
  await assert.rejects(pending, { code: 'SIGN_IN_COMMIT_FAILED' }); wait.resolve(); await new Promise(r => setImmediate(r));
  await assert.rejects(late, { code: 'SIGN_IN_COMMIT_FAILED' }); assert.equal(stored, 0);
});
