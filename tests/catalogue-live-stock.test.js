import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshCatalogueStock} from '../api/_catalogue-stock.js';
import {validateShowroomStockObservation} from '../lib/showroom-live-stock.mjs';
import {readFile} from 'node:fs/promises';

const product=(sku,qty)=>({sku,code:sku,barcode:sku,price:27.5,image:`https://example.test/${sku}.jpg`,images:[`https://example.test/${sku}.jpg`],
 unitsOfIssue:'PACK 12',stockQty:qty,stockOnHand:qty,inStock:qty>0,availability:{state:qty?'in_stock':'out_of_stock',canOrder:qty>0}});
const proof=(sku,qty)=>validateShowroomStockObservation(sku,{CODE:sku,ONHAND:qty,BOOKED:0,UNITS:'PKT,12'});
test('fresh complete catalogue observes cached-zero products before stock discovery filters',async()=>{
 const rows=[product('8640000255',96),product('RESTOCKED',0),product('SOLDOUT',12)];
 let seen;
 const current=await refreshCatalogueStock(rows,{readStock:async codes=>{seen=codes;return new Map([
  ['8640000255',proof('8640000255',68)],['RESTOCKED',proof('RESTOCKED',5)],['SOLDOUT',proof('SOLDOUT',0)]]);}});
 assert.deepEqual(seen,['8640000255','RESTOCKED','SOLDOUT']);
 assert.deepEqual(current.filter(row=>row.inStock).map(row=>row.sku),['8640000255','RESTOCKED']);
 assert.deepEqual(current.map(row=>row.stockOnHand),[68,5,0]);
 assert.deepEqual(current.map(row=>[row.price,row.image,row.images,row.unitsOfIssue]),rows.map(row=>[row.price,row.image,row.images,row.unitsOfIssue]));
 assert.deepEqual(rows.map(row=>row.stockOnHand),[96,0,12]);
});
test('source-unavailable discovery cannot present the old stock snapshot as fresh',async()=>{
 const current=await refreshCatalogueStock([product('8640000255',96)],{readStock:async()=>new Map()});
 assert.equal(current[0].stockOnHand,null);assert.equal(current[0].stockSource,'unavailable');assert.equal(current[0].inStock,false);
});
test('a catalogue beyond the source budget stays readable with unobserved rows unknown',async()=>{
 const rows=Array.from({length:10001},(_,index)=>product(`P${index}`,96));let seen;
 const refreshed=await refreshCatalogueStock(rows,{readStock:async codes=>{seen=codes;return new Map();}});
 assert.equal(seen.length,10000);assert.equal(refreshed.length,10001);
 assert.equal(refreshed.at(-1).stockOnHand,null);assert.equal(refreshed.at(-1).image,rows.at(-1).image);
});
test('all authenticated catalogue response branches refresh stock rather than returning metadata-only304',async()=>{
 const source=await readFile(new URL('../api/products.js',import.meta.url),'utf8');
 assert.equal((source.match(/json\(await refreshCatalogueStock\(/g)||[]).length,3);
 assert.doesNotMatch(source,/status\(304\)/);
 assert.ok(source.indexOf('await requireApprovedCustomer(req, res)')<source.indexOf('json(await refreshCatalogueStock('));
});
