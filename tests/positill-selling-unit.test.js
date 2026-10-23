import test from 'node:test';
import assert from 'node:assert/strict';
import {positillUnitObservation,productSellingUnit,withPositillObservation} from '../lib/positill-selling-unit.mjs';
import {validateInstoreBridgeStock} from '../api/stock.js';
import {resolveInstoreOrderLine} from '../api/send-order.js';
import {parseCartMutation,cartPayload} from '../api/account-cart.js';

const sku='8781830003';
const row={CODE:sku,DESCR:'TOOTHPICK 3PC',UNITS:'PKT',ONHAND:600,BOOKED:0,PRICE_A:8.26};
const index={sku,image_source:'nutstore',title:row.DESCR,price:9.5,image_review_status:'verified',visibility_status:'search_only',is_active:true};
test('8781830003 keeps Positill PKT without inferring three sellable pieces from the title',()=>{
 const stock=validateInstoreBridgeStock(sku,row);
 const product=withPositillObservation({sku,isExtendedRange:true,price:9.5},stock);
 assert.equal(product.unitsOfIssue,'PACK');
 assert.equal(product.unitsOfIssueRaw,'PKT');
 assert.equal(productSellingUnit(product).label,'Packet');
 assert.equal(productSellingUnit(product).priceSuffix,'per packet');
 assert.equal(product.stockQty,600);
 assert.equal(product.price,9.5);
 assert.equal(productSellingUnit(product).unitsPerSellingUnit,null);
});
test('packet counts, each, pair and metre come from Positill rather than the browser',()=>{
 for(const [raw,unit] of [['PKT,25','PACK 25'],['PCS','EACH'],['EACH','EACH'],['PAIR','PAIR'],['M','METRE']])assert.equal(positillUnitObservation(sku,{...row,UNITS:raw}).unitsOfIssue,unit);
});
test('missing, invalid and mismatched-source units cannot silently become Each',()=>{
 for(const UNITS of [null,undefined,'',' ','N/A','UNKNOWN',false,0,'0'])assert.throws(()=>positillUnitObservation(sku,{...row,UNITS}));
 assert.throws(()=>positillUnitObservation(sku,{...row,CODE:'OTHER'}),/different product/);
 assert.equal(productSellingUnit({isExtendedRange:true,unitsOfIssue:'EACH'}).label,'Unit needs checking');
 assert.equal(productSellingUnit({unitsOfIssue:'EACH'}).label,'Each');
 assert.equal(withPositillObservation({sku,isExtendedRange:true},{...validateInstoreBridgeStock(sku,row),sku:'OTHER'}).unitsOfIssueVerified,false);
});
test('the order server replaces forged browser Each with exact live Positill PKT',()=>{
 const item={qty:2,product:{sku,id:sku,isExtendedRange:true,unitsOfIssue:'EACH',price:.01}};
 const order=resolveInstoreOrderLine(item,{indexRow:index,bridgeRow:row});
 assert.equal(order.product.unitsOfIssue,'PACK');
 assert.equal(order.product.unitsOfIssueRaw,'PKT');
 assert.equal(order.product.price,9.5);
 assert.equal(order.qty,2);
 assert.equal(order.product.casePack,'Packet');
 for(const bridgeRow of [undefined,{...row,UNITS:''},{...row,CODE:'OTHER'}])assert.throws(()=>resolveInstoreOrderLine(item,{indexRow:index,bridgeRow}),/selling unit checked/);
});
test('verifying units never converts or writes actual stock quantities',()=>{
 for(const [ONHAND,BOOKED,expected] of [[600,0,600],[0,0,0],[-5,0,0],[12,3,9]]) {
  const original={...row,ONHAND,BOOKED};
  const before=JSON.stringify(original);
  assert.equal(validateInstoreBridgeStock(sku,original).qty,expected);
  assert.equal(JSON.stringify(original),before);
 }
});
test('verified packet display metadata survives the saved basket without changing its quantity',()=>{
 const product=withPositillObservation({sku,id:sku,isExtendedRange:true,price:9.5},validateInstoreBridgeStock(sku,row));
 const now=Date.now();
 const saved=parseCartMutation({mode:'save',items:[{product,qty:2}],revision:0,activityAt:now},{now});
 const restored=cartPayload({items:saved.items,revision:1,activity_at:new Date(now).toISOString()});
 assert.equal(restored.items[0].qty,2);
 assert.equal(productSellingUnit(restored.items[0].product).label,'Packet');
 // Saved display metadata, even when forged, never authorises a unit at checkout.
 assert.throws(()=>resolveInstoreOrderLine({qty:2,product:{...restored.items[0].product,unitsOfIssue:'EACH'}},{indexRow:index,bridgeRow:row}),/changed Positill selling unit/);
 assert.equal(resolveInstoreOrderLine({qty:2,product:restored.items[0].product},{indexRow:index,bridgeRow:row}).product.unitsOfIssue,'PACK');
});
