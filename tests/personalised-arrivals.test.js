import test from 'node:test';
import assert from 'node:assert/strict';
import {matchedRegistrationInterests,selectPersonalisedArrivals} from '../api/_personalised-arrivals.js';
const now=Date.parse('2026-10-02T12:00:00Z');
const customer={product_categories:['Art, craft & beads','Other']};
const product={id:'p',code:'CP50',name:'Craft paint',category_path:['arts-crafts-stationery','paint-art-supplies'],stock_on_hand:4,is_new:true,is_archived:false,created_at:'2026-10-01T12:00:00Z',image_url:'https://example.test/paint.png'};
test('curated narrow categories match only selected interests without guessing Other/general',()=>{
  assert.deepEqual(matchedRegistrationInterests(customer.product_categories,product.category_path),['Art, craft & beads']);
  assert.deepEqual(matchedRegistrationInterests(['Stationery & educational products'],product.category_path),[]);
  assert.deepEqual(matchedRegistrationInterests(['Pet products','General merchandise / variety'],['pets']),[]);
  assert.deepEqual(matchedRegistrationInterests(['Art, craft & beads'],['beads-jewellery','metal-components']),['Art, craft & beads']);
});
test('only verified new, dated, in-stock, unarchived catalog records are suggested',()=>{
  assert.equal(selectPersonalisedArrivals(customer,[product],{now})[0].provenance.recency,'catalogue-created-at');
  for(const change of [{is_new:false},{is_archived:true},{is_archived:null},{stock_on_hand:0},{stock_on_hand:'4'},{created_at:null},{created_at:'2026-08-01'},{created_at:'2026-10-03'},{category_path:['hardware']},{code:null}])assert.deepEqual(selectPersonalisedArrivals(customer,[{...product,...change}],{now}),[]);
});
test('suggestions are recent-first, bounded and deduplicated; no actual arrival claim',()=>{
  const rows=Array.from({length:7},(_,i)=>({...product,id:`p${i}`,code:`CP${i}`}));rows.push({...rows[0]});
  const found=selectPersonalisedArrivals(customer,rows,{now,limit:100});assert.equal(found.length,3);assert.equal(new Set(found.map(p=>p.code)).size,3);assert.match(found[0].reason,/New in the catalogue/);assert.doesNotMatch(found[0].reason,/landed|delivered|arrived/i);
});
