import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
const journal = await import(process.env.PROTO_CHECKOUT_TEST_BASELINE || '../src/lib/pendingCheckout.mjs');
const make = (customerId = 'synthetic-A') => ({ version: 1, customerId, payload: { clientRef: 'kept-reference', items: Array.from({length:11}, (_, i) => ({qty:1,product:{sku:`ITEM-${i}`}})), deliveryMethod:'In store pick up',customerNotes:'keep notes',promoCode:'KEEP' }, items:Array.from({length:11},(_,i)=>({qty:1,product:{id:`ITEM-${i}`,price:250}})), total:2750,fingerprint:'11 lines',options:{courierChoice:'pickup',customerNotes:'keep notes',promo:{code:'KEEP'}} });
const storage = () => { const data = new Map(); return {data,getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}; };
const rejection = (overrides={}) => ({status:400,code:'ORDER_PRODUCT_UNAVAILABLE',data:{rejectedBeforeCapture:true},...overrides});
const amend = intent => ({...intent,payload:{...intent.payload,items:intent.payload.items.slice(0,8)},items:intent.items.slice(0,8),total:2000,fingerprint:'8 lines'});
function dispatched(device) {return journal.recordPendingCheckoutDispatch(device,journal.writePendingCheckout(device,'synthetic-A',make()));}

test('uncertain journal forbids changed lines even with historic reviewRequired flag',()=>{
 const device=storage(); const intent=journal.writePendingCheckout(device,'synthetic-A',make());
 const review=journal.writePendingCheckout(device,'synthetic-A',{...intent,reviewRequired:true});
 assert.throws(()=>journal.writePendingCheckout(device,'synthetic-A',amend(review)),{code:'CHECKOUT_RECOVERY_STORAGE'});
 assert.equal(journal.readPendingCheckout(device,'synthetic-A').payload.items.length,11);
});
for (const [name,error] of [ ['missing marker',rejection({data:{}})], ['string marker',rejection({data:{rejectedBeforeCapture:'true'}})], ['wrong status',rejection({status:503})], ['generic400',rejection({code:'GENERIC'})], ['timeout',{code:'REQUEST_TIMEOUT'}], ['reference conflict',rejection({status:409,code:'ORDER_REFERENCE_CONFLICT'})] ]) {
 test(`${name} preserves original frozen request`,()=>{
  const device=storage();const intent=dispatched(device);const rejected=journal.recordPendingCheckoutRejection(device,intent,error);
  assert.equal(rejected.confirmedRejectedBeforeCapture,false);
  assert.throws(()=>journal.writePendingCheckout(device,'synthetic-A',amend(rejected)),{code:'CHECKOUT_RECOVERY_STORAGE'});
  assert.deepEqual(journal.readPendingCheckout(device,'synthetic-A').payload,intent.payload);
 });
}
test('durable first dispatch proof permits only same-reference same-option amendment after reload',()=>{
 const device=storage();const sent=dispatched(device);journal.recordPendingCheckoutRejection(device,sent,rejection());
 const recovered=journal.readPendingCheckout(device,'synthetic-A');assert.equal(recovered.confirmedRejectedBeforeCapture,true);
 const next=journal.writePendingCheckout(device,'synthetic-A',amend(recovered));
 assert.equal(next.payload.items.length,8);assert.equal(next.payload.clientRef,sent.payload.clientRef);assert.deepEqual(next.options,sent.options);assert.equal(next.dispatchCount,0);assert.equal(next.confirmedRejectedBeforeCapture,false);
});
test('proof on later retry cannot prove uncertain first handler did not capture',()=>{
 const device=storage();const first=dispatched(device);const second=journal.recordPendingCheckoutDispatch(device,first);
 const rejected=journal.recordPendingCheckoutRejection(device,second,rejection());
 assert.equal(rejected.dispatchCount,2);assert.equal(rejected.confirmedRejectedBeforeCapture,false);
 assert.throws(()=>journal.writePendingCheckout(device,'synthetic-A',amend(rejected)),{code:'CHECKOUT_RECOVERY_STORAGE'});
});
test('legacy journal proof stays ambiguous',()=>{
 const device=storage();device.setItem('proto_pending_checkout_v1:synthetic-A',JSON.stringify(make()));
 const sent=journal.recordPendingCheckoutDispatch(device,journal.readPendingCheckout(device,'synthetic-A'));
 const rejected=journal.recordPendingCheckoutRejection(device,sent,rejection());assert.equal(rejected.dispatchCount,null);assert.equal(rejected.confirmedRejectedBeforeCapture,false);
});
test('two-tab stale view cannot record rejection or dispatch against a newer journal',()=>{
 const device=storage();const first=dispatched(device);const second=journal.recordPendingCheckoutDispatch(device,first);
 assert.throws(()=>journal.recordPendingCheckoutRejection(device,first,rejection()),{code:'CHECKOUT_RECOVERY_STORAGE'});
 assert.throws(()=>journal.recordPendingCheckoutDispatch(device,first),{code:'CHECKOUT_RECOVERY_STORAGE'});
 assert.equal(journal.readPendingCheckout(device,'synthetic-A').dispatchCount,second.dispatchCount);
});
test('account boundary, new reference and changed options never amend rejected request',()=>{
 const device=storage();const rejected=journal.recordPendingCheckoutRejection(device,dispatched(device),rejection());
 assert.equal(journal.readPendingCheckout(device,'synthetic-B'),null);
 assert.throws(()=>journal.writePendingCheckout(device,'synthetic-B',amend(rejected)),{code:'CHECKOUT_RECOVERY_STORAGE'});
 for(const change of [{...amend(rejected),payload:{...amend(rejected).payload,clientRef:'new-ref'}},{...amend(rejected),options:{courierChoice:'proto'}}])assert.throws(()=>journal.writePendingCheckout(device,'synthetic-A',change),{code:'CHECKOUT_RECOVERY_STORAGE'});
});
test('accepted result forbids dispatch and proof reclassification',()=>{
 const device=storage();const sent=dispatched(device);const accepted=journal.writePendingCheckout(device,'synthetic-A',{...sent,result:{success:true,orderId:'inert-order'}});
 assert.throws(()=>journal.recordPendingCheckoutDispatch(device,accepted),{code:'CHECKOUT_RECOVERY_STORAGE'});
 assert.deepEqual(journal.recordPendingCheckoutRejection(device,accepted,rejection()).result,accepted.result);
});
test('missing cross-tab lock API blocks action rather than dispatching without a lock',async()=>{
 let actions=0;await assert.rejects(journal.withPendingCheckoutLock(undefined,'synthetic-A',()=>{actions++;}),{code:'CHECKOUT_RECOVERY_STORAGE'});assert.equal(actions,0);
});


test('fresh409price review permits same-quantity price correction but missing-marker or later review does not',()=>{
 for (const [marker,count,allowed] of [[true,1,true],[false,1,false],[true,2,false]]) {
  const device=storage();let sent=dispatched(device);if(count===2)sent=journal.recordPendingCheckoutDispatch(device,sent);
  const reviewed=journal.recordPendingCheckoutRejection(device,sent,{status:409,code:'ORDER_REVIEW_REQUIRED',data:{rejectedBeforeCapture:marker}});
  const sameQuantity={...reviewed,payload:{...reviewed.payload,items:reviewed.payload.items.map(item=>({...item,product:{...item.product,checkoutSnapshot:{unitPrice:251,stockQty:100}}}))},items:reviewed.items.map(item=>({...item,product:{...item.product,price:251}})),total:2761};
  if(allowed){const amended=journal.writePendingCheckout(device,'synthetic-A',sameQuantity);assert.equal(amended.payload.items.length,11);assert.equal(amended.payload.items[0].qty,1);assert.equal(amended.payload.items[0].product.checkoutSnapshot.unitPrice,251);assert.equal(amended.payload.clientRef,sent.payload.clientRef);assert.deepEqual(amended.options,sent.options);}
  else assert.throws(()=>journal.writePendingCheckout(device,'synthetic-A',sameQuantity),{code:'CHECKOUT_RECOVERY_STORAGE'});
 }
});
