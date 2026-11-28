import test from 'node:test';
import assert from 'node:assert/strict';
import {validateShowroomStockObservation,overlayShowroomLiveStock} from '../lib/showroom-live-stock.mjs';
import {refreshCatalogueStock} from '../api/_catalogue-stock.js';
import {createStockHandler} from '../api/stock.js';
import {resolveStandardPrices} from '../api/send-order.js';
import {adapt} from '../api/products.js';
import {validateShowroomStockBatch} from '../lib/showroom-batch-stock.mjs';
import {stockUnitComparisonKey} from '../lib/stock-unit-comparison.mjs';
import {readFileSync} from 'node:fs';
const code='17BFTGC';
const rows=['BLK','YEL'].map(colour=>({sku:`${code}-${colour}`,barcode:code,title:`Five piece set ${colour}`,price:119,units_of_issue:'5PCS',min_order_qty:1,stock_qty:22,available_stock:22,to_order:false,image_url_one:`https://images.example.test/${colour}.jpg`}));
function db(values=rows){return {from(table){assert.equal(table,'website_stock');const q={select(){return q;},or(){return q;},eq(){return q;},limit(){return Promise.resolve({data:values});},in(key,ids){return Promise.resolve({data:values.filter(row=>ids.includes(row[key]))});}};return q;},async rpc(){return {data:[]};}};}
const raw=(units='5PC')=>({CODE:code,ONHAND:22,BOOKED:0,UNITS:units,DESCR:'FIVE PIECE SET'});
const proof=(units='5PC')=>validateShowroomStockObservation(code,raw(units));
const products=(values=rows)=>values.map(row=>adapt(row,[]));
test('shared Admin/customer original-raw piece grammar vectors remain identical',()=>{
 const {vectors}=JSON.parse(readFileSync(new URL('./fixtures/positill-price-piece-unit-vectors.json',import.meta.url)));
 for(const {value,expected}of vectors)assert.equal(stockUnitComparisonKey(value),expected,JSON.stringify(value));
});
test('17BFTGC fresh22 reaches both original5PCS aliases without changing labels,price or photos',()=>{
 const original=products(),before=structuredClone(original),result=overlayShowroomLiveStock(original,new Map([[code,proof()]]));
 assert.deepEqual(result.map(row=>row.stockOnHand),[22,22]);
 for(let i=0;i<result.length;i++){assert.equal(result[i].stockSource,'positill_live');assert.equal(result[i].availability.canOrder,true);for(const field of ['sku','barcode','unitsOfIssue','sellingUnit','price','image','images'])assert.deepEqual(result[i][field],before[i][field]);}
 assert.deepEqual(original,before);
});
test('actual stock API and checkout retain one22 pool and unchanged5PCS119 mains',async()=>{
 for(const row of rows){const res={setHeader(){},status(n){this.code=n;return this;},json(value){this.value=value;return this;}};
 await createStockHandler({authenticate:async()=>({}),approve:async()=>true,getClient:()=>db([row]),readStock:async codes=>{assert.deepEqual(codes,[code]);return new Map([[code,proof()]]);}})({method:'GET',query:{sku:code,website_sku:row.sku}},res);
 assert.equal(res.code,200);assert.equal(res.value.qty,22);assert.equal(res.value.stock_source,'positill_live');}
 const result=await resolveStandardPrices(rows.map(row=>({qty:12,product:{sku:row.sku,code,checkoutSnapshot:{unitPrice:119,stockQty:22}}})),{index:db(),readStock:async codes=>{assert.deepEqual(codes,[code]);return new Map([[code,proof()]]);}});
 assert.deepEqual(result.map(line=>line.qty),[12,12]);
 for(let i=0;i<result.length;i++){const p=result[i].product;assert.equal(p.stockOnHand,22);assert.equal(p.unitsOfIssue,'5PCS');assert.equal(p.price,119);assert.equal(p.image,rows[i].image_url_one);assert.equal(p.stockRequest.sharedStock,true);assert.equal(p.stockRequest.requestedQty,24);assert.equal(p.stockRequest.availableQty,22);assert.equal(p.stockRequest.shortfallQty,2);}
});
test('batch discovery uses the same piece compatibility after exact raw report validation',async()=>{
 const now=Date.now(),report={ok:true,schemaVersion:'proto.sql-report.v1',report:{id:'stock.website_balances'},params:{skus:[code]},rows:[raw()],rowCount:1,meta:{source:'POSWINSQL',readOnly:true,backendCompatible:true,requestedCount:1,rowCapReached:false,missingCodes:[],generatedAt:new Date(now).toISOString()}};
 const observations=validateShowroomStockBatch(report,[code],{now});
 const actual=await refreshCatalogueStock(products(),{readStock:async()=>observations});assert.deepEqual(actual.map(row=>row.stockOnHand),[22,22]);
});
test('actual source and website raw malformed pieces cannot become valid through display normalization',()=>{
 for(const units of ['50PC','0PC','-5PCS','5-PC','5_PCS','0.5PC','05PCS','5PCS X 2','PC',null,'EACH','DOZ','PACK 5']){
  const malformed=products([{...rows[0],units_of_issue:units},rows[1]]);
  assert.deepEqual(overlayShowroomLiveStock(malformed,new Map([[code,proof()]])).map(row=>row.stockOnHand),[null,null],String(units));
 }
 for(const units of ['0PC','-5PCS','5-PC','5_PCS','0.5PC','05PCS','5PCS X 2','PC','5PCS\n',null])assert.throws(()=>proof(units),String(units));
 for(const units of ['50PC','EACH','DOZ','PACK 5'])assert.deepEqual(overlayShowroomLiveStock(products(),new Map([[code,proof(units)]])).map(row=>row.stockOnHand),[null,null],units);
 for(const raw of [undefined,null,5,{},['5PC']])assert.deepEqual(overlayShowroomLiveStock(products(),new Map([[code,{...proof(),sourceUnitsRaw:raw}]])).map(row=>row.stockOnHand),[null,null]);
});
test('13plus9 shares22 exactly;13plus10 remains one shortage request under existing ordinary policy',async()=>{
 for(const [quantities,total,shortfall]of [[[13,9],22,0],[[13,10],23,1]]){
  const lines=await resolveStandardPrices(rows.map((row,i)=>({qty:quantities[i],product:{sku:row.sku,code,checkoutSnapshot:{unitPrice:119,stockQty:22}}})),{index:db(),readStock:async()=>new Map([[code,proof()]])});
  assert.deepEqual(lines.map(line=>line.qty),quantities);
  for(const line of lines){assert.equal(line.product.stockOnHand,22);assert.equal(line.product.stockRequest?.shortfallQty||0,shortfall);if(shortfall)assert.equal(line.product.stockRequest.requestedQty,total);}
 }
});
test('existing exact PKT00 approved exception still overlays PACK100 without any new conversion',()=>{
 const row={CODE:'8640000227',ONHAND:5,BOOKED:0,UNITS:'PKT,00',DESCR:'BALLOONS 12INCH PKT,100 WHITE'};
 const observation=validateShowroomStockObservation(row.CODE,row),product={sku:row.CODE,barcode:row.CODE,unitsOfIssue:'PACK 100'};
 const [result]=overlayShowroomLiveStock([product],new Map([[row.CODE,observation]]));assert.equal(result.stockOnHand,5);assert.equal(result.unitsOfIssue,'PACK 100');
});
