import {test} from 'node:test';
import assert from 'node:assert/strict';
import {effectiveArrivedStock,overlayArrivedStock,assertArrivedOrderTotals} from '../api/_arrived-stock.js';

const cases=[['8610420052','PACK 30','PKY,30','PKY 30'],...['A','B','C','D','E','F'].map(s=>['8626300133'+s,'PACK 10',s==='A'?'SHEET':'EACH',s==='A'?'SHEET':'EACH'])];
const fixture=([code,oldUnit,rawUnit])=>({receipt:{code,quantity:20,units:oldUnit,status:'receiving-recorded'},row:{CODE:code,UNITS:rawUnit,PRICE_A:10,ONHAND:11,BOOKED:2}});

for(const entry of cases){
 test(`${entry[0]} uses current selling units only after confirmed receiving`,()=>{
  const {receipt,row}=fixture(entry),result=effectiveArrivedStock(receipt.code,row,receipt);
  assert.equal(result.unitsOfIssue,entry[3]);assert.equal(result.qty,9);assert.equal(result.price,11.5);
  assert.equal(effectiveArrivedStock(receipt.code,{...row,ONHAND:0,BOOKED:0},receipt).qty,0);
  assert.equal(effectiveArrivedStock(receipt.code,{...row,ONHAND:-3,BOOKED:0},receipt).qty,0);
  assert.throws(()=>effectiveArrivedStock(receipt.code,row,{...receipt,status:'active'}),/selling unit/);
  for(const broken of [{...row,CODE:'OTHER'},{...row,UNITS:''},{...row,UNITS:'UNKNOWN'},{...row,ONHAND:null},{...row,BOOKED:-1},{...row,PRICE_A:0}])assert.throws(()=>effectiveArrivedStock(receipt.code,broken,receipt));
  assert.equal(receipt.units,entry[1]);assert.equal(receipt.quantity,20);
 });
}
test('discovery and repeated order lines share the completed-receipt quantity',async()=>{
 const {receipt,row}=fixture(cases[1]),records=new Map([[receipt.code,receipt]]),sources=new Map([[receipt.code,row]]);
 const listed=await overlayArrivedStock([{sku:receipt.code,available_stock:20,price:999}],{client:{rpc:async()=>({data:[receipt]})},env:{INSTORE_ARRIVED_STOCK_ENABLED:'1'},read:async()=>row});
 assert.equal(listed[0].available_stock,9);assert.equal(listed[0].price,11.5);
 const line=qty=>({qty,product:{sku:receipt.code,unitsOfIssue:'PACK 10'}});
 assert.equal(assertArrivedOrderTotals([line(4),line(5)],records,sources).get(receipt.code).qty,9);
 assert.throws(()=>assertArrivedOrderTotals([line(4),line(6)],records,sources),/only 9/);
 const unavailable=await overlayArrivedStock(listed,{client:{rpc:async()=>({data:[receipt]})},env:{INSTORE_ARRIVED_STOCK_ENABLED:'1'},read:async()=>{throw Error('offline');}});
 assert.equal(unavailable[0].available_stock,0);
});
