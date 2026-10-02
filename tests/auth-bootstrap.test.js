import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createAuthBootstrapGuard, createAuthIdentityGuard } from '../src/lib/authBootstrapGuard.mjs';
import { createProfileRequestCache } from '../src/lib/profileRequestCache.js';
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const fresh = () => ({ access_token: [encode({ alg: 'HS256' }), encode({ exp: Math.floor(Date.now()/1000)+3600, sub:'00000000-0000-4000-8000-000000000211' }), 'c3ludGhldGlj'].join('.'), refresh_token:'synthetic-only' });
function fixture() {
  const values = new Map();
  let gateRead=false, entered, release;
  const started=new Promise(resolve=>entered=resolve), gate=new Promise(resolve=>release=resolve);
  const storage={getItem:async key=>{const captured=values.get(key)??null;if(gateRead && key==='synthetic-bootstrap'){gateRead=false;entered();await gate;}return captured;},setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const sdk=createClient('https://critical.example.invalid','synthetic-key',{global:{fetch:async()=>new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000211'}),{headers:{'Content-Type':'application/json'}})},auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,storage,storageKey:'synthetic-bootstrap'}});
  return { sdk, values, started, release:()=>release(), arm:()=>{gateRead=true;} };
}

test('real SDK late INITIAL_SESSION null cannot overwrite a verified sign-in', async () => {
  const {sdk,values,started,release,arm}=fixture();
  await sdk.auth.initialize();
  const guard=createAuthBootstrapGuard(), checkpoint=guard.checkpoint();
  let current=null; const events=[];
  arm();
  const {data:{subscription}}=sdk.auth.onAuthStateChange((event,value)=>{
    const accepted=guard.acceptEvent(event,checkpoint);events.push({event,accepted});if(accepted)current=value;
  });
  await started;
  const next=fresh(); await sdk.auth.setSession(next);
  release(); await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(current.access_token,next.access_token);
  assert.deepEqual(events,[{event:'SIGNED_IN',accepted:true},{event:'INITIAL_SESSION',accepted:false}]);
  assert.equal(JSON.parse(values.get('synthetic-bootstrap')).access_token,next.access_token);
  await sdk.auth.signOut({scope:'local'});
  assert.equal(current,null);
  assert.equal(values.has('synthetic-bootstrap'),false);
  subscription.unsubscribe(); await sdk.auth.stopAutoRefresh();
});

test('explicit login and signed-out events invalidate an older bootstrap checkpoint', () => {
  const guard=createAuthBootstrapGuard(), checkpoint=guard.checkpoint();
  assert.equal(guard.acceptEvent('INITIAL_SESSION',checkpoint),true);
  guard.markLogin();
  assert.equal(guard.acceptsBootstrap(checkpoint),false);
  assert.equal(guard.acceptEvent('INITIAL_SESSION',checkpoint),false);
  assert.equal(guard.acceptEvent('SIGNED_OUT',checkpoint),true);
  const newer=guard.checkpoint();
  assert.equal(guard.acceptsBootstrap(newer),true);
  assert.equal(guard.acceptEvent('TOKEN_REFRESHED',newer),true);
  assert.equal(guard.acceptsBootstrap(newer),false);
});

test('real SDK queued getSession snapshot cannot overwrite the sign-in committed while its lock drains', async () => {
  const {sdk,started,release,arm}=fixture();
  await sdk.auth.initialize();
  const guard=createAuthBootstrapGuard(); let current=null;
  const checkpoint=guard.checkpoint();
  const {data:{subscription}}=sdk.auth.onAuthStateChange((event,value)=>{if(guard.acceptEvent(event,checkpoint))current=value;});
  await new Promise(resolve=>setTimeout(resolve,0));
  arm();
  const read=sdk.auth.getSession().then(({data})=>{if(guard.acceptsBootstrap(checkpoint))current=data.session;return data.session;});
  await started;
  const next=fresh(), commit=sdk.auth.setSession(next);
  await new Promise(resolve=>setTimeout(resolve,0));
  release();
  const [snapshot]=await Promise.all([read,commit]);
  assert.equal(snapshot,null);
  assert.equal(current.access_token,next.access_token);
  subscription.unsubscribe(); await sdk.auth.stopAutoRefresh();
});

test('profile identity epochs reject queued work after logout and A-to-B-to-A changes', async () => {
  for (const replacements of [[null], ['b','a']]) {
    const identity=createAuthIdentityGuard(),cache=createProfileRequestCache();
    identity.acceptUser('a');
    const checkpoint=identity.checkpoint();let writes=0,requests=0;
    const pending=cache.load({userId:'a',request:async()=>{
      if(!identity.acceptsProfile(checkpoint,'a'))return null;
      requests++; writes++; return {id:'a'};
    }});
    for(const id of replacements){identity.acceptUser(id);cache.clear();}
    assert.equal(await pending,null);
    assert.equal(writes,0);assert.equal(requests,0);
  }
});

test('same-user refresh preserves coalesced profile work but logout rejects late completion', async () => {
  const identity=createAuthIdentityGuard();identity.acceptUser('a');
  const checkpoint=identity.checkpoint();
  assert.equal(identity.acceptUser('a'),false);
  assert.equal(identity.acceptsProfile(checkpoint,'a'),true);
  identity.acceptUser(null);
  assert.equal(identity.acceptsProfile(checkpoint,'a'),false);
  identity.acceptUser('a');
  assert.equal(identity.acceptsProfile(checkpoint,'a'),false);
});
