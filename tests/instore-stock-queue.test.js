import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstoreStockQueue } from '../src/lib/instoreStockQueue.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return { promise, resolve }; };

test('24 card lookups share a three-request ceiling and all complete', async () => {
 const schedule=createInstoreStockQueue();let active=0,max=0;const blockers=Array.from({length:24},deferred),started=[];
 const jobs=blockers.map((b,i)=>schedule(async()=>{active++;max=Math.max(max,active);started.push(i);await b.promise;active--;return i;}));
 await tick();assert.deepEqual(started,[0,1,2]);
 for(let i=0;i<24;i++){blockers[i].resolve();await tick();}
 assert.deepEqual(await Promise.all(jobs),Array.from({length:24},(_,i)=>i));assert.equal(max,3);
});
test('leaving a result page removes queued reads before they reach the network', async () => {
 const schedule=createInstoreStockQueue(1),gate=deferred(),controller=new AbortController();let calls=0;
 const first=schedule(()=>gate.promise);const queued=schedule(()=>{calls++;},{signal:controller.signal});const rejected=assert.rejects(queued,{name:'AbortError'});
 controller.abort();await rejected;gate.resolve();await first;await tick();assert.equal(calls,0);
});
test('an already cancelled read never runs',async()=>{const c=new AbortController();c.abort();let calls=0;await assert.rejects(createInstoreStockQueue()(()=>{calls++;},{signal:c.signal}),{name:'AbortError'});assert.equal(calls,0);});
test('cancellation between admission and execution never runs the read',async()=>{const c=new AbortController();let calls=0;const job=createInstoreStockQueue()(()=>{calls++;},{signal:c.signal});c.abort();await assert.rejects(job,{name:'AbortError'});assert.equal(calls,0);});
test('a failed lookup releases its slot without retrying or blocking another product',async()=>{const schedule=createInstoreStockQueue(1);let calls=0;const bad=schedule(()=>{calls++;throw Error('offline');});const good=schedule(()=>42);await assert.rejects(bad,/offline/);assert.equal(await good,42);assert.equal(calls,1);});
test('running cancellation uses the request signal and releases capacity after settling',async()=>{const schedule=createInstoreStockQueue(1),controller=new AbortController();const running=schedule(()=>new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{name:'AbortError'})),{once:true})),{signal:controller.signal});await tick();const next=schedule(()=>7);controller.abort();await assert.rejects(running,{name:'AbortError'});assert.equal(await next,7);});
test('results are not cached between checks',async()=>{const schedule=createInstoreStockQueue();let stock=32;assert.equal(await schedule(()=>stock),32);stock=0;assert.equal(await schedule(()=>stock),0);});
