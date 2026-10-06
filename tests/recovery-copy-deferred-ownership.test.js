import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { basketLineKey, mergeBasketLines } from '../lib/basket-lines.mjs';
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const callback = source.match(/const restorePendingRecoveryCopy = useCallback\(([\s\S]*?\r?\n {2}}), \[[^\]]*\]\);/)[1];
const fingerprint = readFileSync(new URL('../src/lib/accountCart.js', import.meta.url), 'utf8')
  .match(/export function cartFingerprint\(items\) \{[\s\S]*?\r?\n\}/)[0].replace('export ', '');
const line = (qty=1, price=10) => ({ product:{id:'SYNTHETIC',source:'main',isExtendedRange:false,price},qty });
function fixture() {
  let identity={userId:'synthetic-A',epoch:1};let release;let queued;
  const calls={writes:[],updates:0,statuses:[]};const entries=new Map();
  const copy={key:'synthetic-recovery-copy',raw:'original-copy-bytes',draft:{accountId:'synthetic-A',items:[line(2)]}};
  entries.set(copy.key,copy.raw);
  const c={basketLineKey,mergeBasketLines,Date,
    cartAccountRef:{current:'synthetic-A'},cartHydratedRef:{current:true},pendingCartSyncRef:{current:null},cartSyncInFlightRef:{current:false},cartConflictRef:{current:false},
    currentCartRef:{current:{items:[line()],activityAt:1}},pendingJournalRef:{current:{raw:null}},cartRevisionRef:{current:7},pendingCheckoutRef:{current:null},lastCheckoutOptionsRef:{current:null},
    hydrateAccountCartItems:()=>new Promise(resolve=>release=resolve),readPendingBytes:()=>c.pendingJournalRef.current.raw,
    localStorage:{getItem:key=>entries.get(key)??null},captureAuthIdentity:()=>identity,
    assertAuthIdentity:owned=>{if(owned!==identity)throw Object.assign(Error('account changed'),{code:'AUTH_ACCOUNT_CHANGED'});},
    keepPendingCart:(...args)=>{calls.writes.push(args);return true;},makeCartSyncOperation:(accountId,items,activityAt,_clear,intent)=>({accountId,items,activityAt,intent,type:'save'}),
    restoredRecoveryCopyRef:{current:null},cartRestoreFingerprintRef:{current:null},cartClearIntentRef:{current:null},cartClearActivityAtRef:{current:null},
    flushSync:action=>{if(queued){c.currentCartRef.current={...c.currentCartRef.current,items:queued};queued=undefined;}action();},
    setCartItems:next=>{calls.updates++;c.currentCartRef.current={...c.currentCartRef.current,items:typeof next==='function'?next(c.currentCartRef.current.items):next};},
    setCartLastActivityAt:activityAt=>{c.currentCartRef.current={...c.currentCartRef.current,activityAt};},setCartSyncStatus:status=>calls.statuses.push(status),
  };
  runInNewContext(fingerprint+'\nglobalThis.restore='+callback+';',c);
  return{c,calls,copy,restore:()=>c.restore(copy),release:()=>release(copy.draft.items),
    epoch:()=>{identity={userId:'synthetic-A',epoch:3};},queue:items=>{queued=items;},entries};
}
test('unchanged recovery-copy lookup restores exact owned draft once',async()=>{
  const f=fixture();const pending=f.restore();f.release();await pending;
  assert.equal(f.calls.writes.length,1);assert.equal(f.calls.updates,1);assert.equal(f.c.currentCartRef.current.items[0].qty,2);
  assert.equal(f.entries.get(f.copy.key),f.copy.raw,'original recovery copy remains evidence');
});
const changes={
  'A-B-A account epoch':f=>f.epoch(),
  'different account':f=>{f.c.cartAccountRef.current='synthetic-B';},
  'price and source only':f=>{f.c.currentCartRef.current.items=[{...line(1,99),product:{...line().product,price:99,source:'instore',isExtendedRange:true}}];},
  'quantity edit':f=>{f.c.currentCartRef.current.items=[line(9)];},
  'basket revision':f=>{f.c.cartRevisionRef.current=9;},
  'activity timestamp':f=>{f.c.currentCartRef.current.activityAt=2;},
  'checkout options':f=>{f.c.lastCheckoutOptionsRef.current={courierChoice:'own'};},
  'pending checkout bytes':f=>{f.c.pendingCheckoutRef.current={raw:'new-request'};},
  'in-flight sync':f=>{f.c.cartSyncInFlightRef.current=true;},
  'sync conflict':f=>{f.c.cartConflictRef.current=true;},
  'lost hydration':f=>{f.c.cartHydratedRef.current=false;},
  'changed pending journal':f=>{f.c.pendingJournalRef.current.raw='new-journal';},
  'changed original copy':f=>{f.entries.set(f.copy.key,'new-copy');},
};
for(const[name,change]of Object.entries(changes))test(`late recovery-copy result holds after ${name}`,async()=>{
  const f=fixture();const pending=f.restore();change(f);const expected=JSON.stringify(f.c.currentCartRef.current);f.release();await pending;
  assert.equal(f.calls.writes.length,0,'no stale durable mutation');assert.equal(f.calls.updates,0,'no stale UI publication');
  assert.equal(JSON.stringify(f.c.currentCartRef.current),expected);assert.equal(f.c.restoredRecoveryCopyRef.current,null);
});
test('queued React edit wins before late recovery-copy commit',async()=>{
  const f=fixture();const pending=f.restore();f.queue([line(8,88)]);f.release();await pending;
  assert.equal(f.calls.writes.length,0);assert.equal(f.c.currentCartRef.current.items[0].qty,8);assert.equal(f.c.currentCartRef.current.items[0].product.price,88);
});
