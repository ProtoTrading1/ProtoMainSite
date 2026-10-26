import {test as it} from 'node:test';
import assert from 'node:assert/strict';
import {effectiveArrivedStock,readArrivedStockRecords,overlayArrivedStock,assertArrivedOrderTotals} from '../api/_arrived-stock.js';
const arrival={code:'8610402007',quantity:30,units:'PACK 30',status:'active'};
const bridge=(onhand=-3,booked=2)=>({CODE:arrival.code,UNITS:'PKT,30',PRICE_A:30,ONHAND:onhand,BOOKED:booked});
const env={INSTORE_ARRIVED_STOCK_ENABLED:'1'};
it('customer availability uses selling packs, negative-stock sales and bookings once',()=>{const value=effectiveArrivedStock(arrival.code,bridge(),arrival);assert.equal(value.qty,25);assert.equal(value.unitsOfIssue,'PACK 30');assert.equal(value.price,34.5);});
it('holds unavailable/mismatched source instead of trusting receipt prices or browser units',()=>{for(const row of [{...bridge(),CODE:'OTHER'},{...bridge(),UNITS:''},{...bridge(),PRICE_A:0},{...bridge(),ONHAND:null}])assert.throws(()=>effectiveArrivedStock(arrival.code,row,arrival));});
it('uses recorded stock alone after receiving, without resurrecting an exhausted allowance',()=>{assert.equal(effectiveArrivedStock(arrival.code,bridge(20,2),{...arrival,status:'receiving-recorded'}).qty,18);assert.equal(effectiveArrivedStock(arrival.code,bridge(0,0),{...arrival,status:'receiving-recorded'}).qty,0);});
it('does not infer receiving completion from a positive balance',()=>{assert.throws(()=>effectiveArrivedStock(arrival.code,bridge(20,0),arrival),/Confirm receiving/);});
it('does not call the receipt backend when disabled',async()=>{let called=0;const client={rpc:()=>{called++;}};assert.equal((await readArrivedStockRecords(client,[arrival.code],{env:{}})).size,0);assert.equal(called,0);});
it('does not silently fall back when the receipt backend is unavailable',async()=>{await assert.rejects(()=>readArrivedStockRecords({rpc:async()=>({error:Error('offline')})},[arrival.code],{env}));});
it('applies the same calculation to discovery and holds only affected rows on a source failure',async()=>{
 const rows=[{sku:arrival.code,available_stock:30,price:999},{sku:'LEGACY',available_stock:20,price:12}],client={rpc:async()=>({data:[arrival]})};
 const good=await overlayArrivedStock(rows,{client,env,read:async()=>bridge()});assert.equal(good[0].available_stock,25);assert.equal(good[0].price,34.5);assert.deepEqual(good[1],rows[1]);assert.equal(rows[0].available_stock,30);
 const held=await overlayArrivedStock(rows,{client,env,read:async()=>{throw Error('offline');}});assert.equal(held[0].available_stock,0);assert.deepEqual(held[1],rows[1]);
});
it('sums repeated order-request lines before applying the arrived-stock limit',()=>{
 const records=new Map([[arrival.code,arrival]]),sources=new Map([[arrival.code,bridge()]]),line=qty=>({qty,product:{sku:arrival.code,price:1,unitsOfIssue:'EACH'}});
 assert.throws(()=>assertArrivedOrderTotals([line(15),line(11)],records,sources),/only 25/);assert.equal(assertArrivedOrderTotals([line(15),line(10)],records,sources).get(arrival.code).qty,25);
});
it('does not change the legacy order-request policy for products without arrival records',()=>{assert.equal(assertArrivedOrderTotals([{qty:999999,product:{sku:'LEGACY'}}],new Map(),new Map()).size,0);});
