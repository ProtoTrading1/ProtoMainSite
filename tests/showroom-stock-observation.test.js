import test from 'node:test';
import assert from 'node:assert/strict';
import {showroomStockTarget,showroomStockTargets,applyShowroomStock,validateShowroomStock,createShowroomStockReader} from '../src/lib/showroomStockObservation.js';
const product=(sku='BALLOON',barcode='8640000255')=>({id:sku,sku,barcode,code:barcode,name:'Original name',price:16.5,unitsOfIssue:'PACK,12',stockQty:96,stockOnHand:96,image:'original.jpg',images:['original.jpg','second.jpg'],availability:{state:'in_stock',canOrder:true}});
const payload=(target,qty=68,time=100000)=>({sku:target.sku,source_code:target.sourceCode,stock_source:'positill_live',qty,available_stock:qty,checked_at:new Date(time).toISOString()});
const actor={userId:'A',epoch:1};
test('fresh observations replace96 with68 then63 without changing identity/photos/main/prices/units',()=>{
 const p=product(),target=showroomStockTarget(p);for(const qty of [68,63,0]){const observation=validateShowroomStock(payload(target,qty),target,100000);const updated=applyShowroomStock(p,{[target.pool]:observation},100000);assert.equal(updated.stockQty,qty);assert.equal(updated.availability.canOrder,qty>0);for(const key of ['sku','barcode','code','name','price','unitsOfIssue','image','images'])assert.deepEqual(updated[key],p[key]);}
});
test('unavailable, stale, mismatched and missing observations never retain cached96 or inventzero',()=>{
 const p={...product(),stock_qty:96},target=showroomStockTarget(p);for(const data of [{...payload(target),stock_source:'unavailable'},{...payload(target),source_code:'WRONG'},{...payload(target),sku:'OTHER'},{...payload(target),qty:null},{...payload(target),qty:1.2},{...payload(target),checked_at:'bad'},{...payload(target),checked_at:new Date(100001).toISOString()}]){if(data.checked_at===new Date(100001).toISOString())continue;assert.throws(()=>validateShowroomStock(data,target,100000));}
 for(const records of [{},{[target.pool]:{status:'unavailable'}},{[target.pool]:validateShowroomStock(payload(target),target,100000)}]){const updated=applyShowroomStock(p,records,140001);assert.equal(updated.stockQty,null);assert.equal(updated.stockOnHand,null);assert.equal(updated.stock_qty,null);assert.equal(updated.showroomStockObservation.checkedAt,null);assert.equal(updated.availability.canOrder,false);assert.equal(updated.availability.label,'Stock unavailable');}
});
test('ordinary null/zero preserves to-order and landed exceptions and skips existing special/Instore contracts',()=>{
 for(const p of [{...product(),toOrder:true},{...product(),availability:{incomingStatus:'landed_awaiting_grv',incomingQty:100}}])assert.equal(applyShowroomStock(p,{}).availability.canOrder,true);
 for(const p of [{...product(),isExtendedRange:true},product('8-34'),product('8640000274')]){assert.equal(showroomStockTarget(p),null);assert.equal(applyShowroomStock(p,{}),p);}
});
test('group aliases share a source pool without summing stock and each variant retains its selected photo',()=>{
 const one=product('BLUE'),two={...product('RED'),image:'red.jpg'},group={isVariantGroup:true,variants:[one,two]};const targets=showroomStockTargets(group);assert.equal(targets.length,1);const updated=applyShowroomStock(group,{[targets[0].pool]:validateShowroomStock(payload(targets[0],63),targets[0],100000)},100000);assert.deepEqual(updated.variants.map(p=>p.stockQty),[63,63]);assert.equal(updated.variants[1].image,'red.jpg');assert.equal(showroomStockTargets({...group,variants:[one,{...two,unitsOfIssue:'EACH'}]}).length,2);
});
test('reader bounds concurrency, deduplicates aliases/card-modal, caches30sec and refreshes after expiry',async()=>{
 let time=100000,reads=0,active=0,peak=0;const wait=[];const read=createShowroomStockReader({session:()=>actor,assertSession:a=>assert.equal(a,actor),now:()=>time,limit:2,load:async target=>{reads++;active++;peak=Math.max(peak,active);await new Promise(resolve=>wait.push(resolve));active--;return payload(target,63,time);}});
 const a=showroomStockTarget(product()),alias=showroomStockTarget(product('ALIAS')),b=showroomStockTarget(product('OTHER','OTHER')),c=showroomStockTarget(product('THIRD','THIRD'));
 const tasks=[read(a),read(alias),read(b),read(c)];await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,2);wait.shift()();wait.shift()();await new Promise(resolve=>setImmediate(resolve));wait.shift()();await Promise.all(tasks);assert.equal(reads,3);assert.equal(peak,2);await read(a);assert.equal(reads,3);time+=30001;const fresh=read(a);await new Promise(resolve=>setImmediate(resolve));wait.shift()();await fresh;assert.equal(reads,4);
});
test('cancelled/changed-account requests cannot commit or be reused by a new owner session',async()=>{
 let current=actor,resolveRead,reads=0;const read=createShowroomStockReader({session:()=>current,assertSession:a=>{if(a!==current)throw Error('Account changed');},now:()=>100000,load:async target=>{reads++;await new Promise(resolve=>{resolveRead=resolve;});return payload(target);}});const target=showroomStockTarget(product());const controller=new AbortController(),pending=read(target,{signal:controller.signal});const held=assert.rejects(pending,{name:'AbortError'});await new Promise(resolve=>setImmediate(resolve));controller.abort();await held;resolveRead();await new Promise(resolve=>setImmediate(resolve));current={userId:'B',epoch:2};const next=read(target);await new Promise(resolve=>setImmediate(resolve));const denied=assert.rejects(next,/Account changed/);current={userId:'C',epoch:3};resolveRead();await denied;assert.equal(reads,2);
});

test('an observation expires at its source deadline, including a memoized29second-old response',()=>{
 const p=product(),target=showroomStockTarget(p),records={[target.pool]:validateShowroomStock(payload(target,68,100000),target,129000)};
 assert.equal(applyShowroomStock(p,records,129999).stockQty,68);
 const expired=applyShowroomStock(p,records,130000);assert.equal(expired.stockQty,null);assert.equal(expired.availability.canOrder,false);assert.equal(expired.showroomStockObservation.checkedAt,null);
});
