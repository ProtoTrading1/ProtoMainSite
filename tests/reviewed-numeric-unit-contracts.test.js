import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {positillUnitObservation} from '../lib/positill-selling-unit.mjs';
import {validateShowroomStockObservation,overlayShowroomLiveStock,readShowroomLiveStock} from '../lib/showroom-live-stock.mjs';
import {createStockHandler} from '../api/stock.js';
import {resolveStandardPrices} from '../api/send-order.js';
import {showroomStockTarget,validateShowroomStock,applyShowroomStock} from '../src/lib/showroomStockObservation.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/reviewed-unit-eight-source-observations.json',import.meta.url),'utf8'));
const units={'8615207001':'EACH','8616200089':'+ 200','8616700030B':'1000','MC085-1':'4+1','MU146-1':'27','M200':'100','8689120060':'+ 10000'};
const now=Date.parse(fixture.observedAt);
// Model only the separately reviewed eleven-field website CAS. No live write.
function reviewedWebsiteRows(){
 let changed=0;
 const rows=fixture.websiteRows.map(row=>{
  if(row.barcode!=='M200'||row.units_of_issue!=='EACH')return structuredClone(row);
  assert.equal(row.pack_description,'100PCS');assert.match(row.title,/100PCS/);changed++;
  return {...structuredClone(row),units_of_issue:'100'};
 });
 assert.equal(changed,11);return rows;
}


test('seven exact reviewed source contracts preserve existing selling units, balances and raw source rows',()=>{
 for(const [code,expected] of Object.entries(units)){
  const row=fixture.sourceRows.find(value=>value.CODE===code),before=structuredClone(row);
  const unit=positillUnitObservation(code,row),stock=validateShowroomStockObservation(code,row,{now});
  assert.equal(unit.unitsOfIssue,expected);assert.equal(unit.unitsOfIssueRaw,row.UNITS);
  assert.equal(stock.sourceUnits,expected);assert.equal(stock.qty,row.ONHAND-row.BOOKED);
  assert.deepEqual(row,before); // Never multiply by a unit label or rewrite the source.
 }
});

test('reviewed admission requires the exact code/raw-unit/description triple and does not admit numeric units globally',()=>{
 for(const code of Object.keys(units)){
  const row=fixture.sourceRows.find(value=>value.CODE===code);
  for(const changed of [{...row,DESCR:'OTHER PRODUCT'},{...row,UNITS:row.UNITS+'0'},{...row,CODE:'UNREVIEWED'}])assert.throws(()=>positillUnitObservation(changed.CODE,changed),/verification/);
  for(const other of Object.keys(units).filter(value=>value!==code))assert.throws(()=>positillUnitObservation(other,{...row,CODE:other}),/verification/);
  assert.throws(()=>positillUnitObservation(code,{...row,CODE:'OTHER'}),/different product/);
 }
 for(const raw of ['1','27','4+1','100','1000','+-200','+-10000','0.44/20'])assert.throws(()=>positillUnitObservation('UNKNOWN',{CODE:'UNKNOWN',UNITS:raw,DESCR:'UNREVIEWED'}),/verification/);
});

test('all eight captured source pools overlay as exactly seven known and one unknown, retaining every alias and photo',()=>{
 const observations=new Map();
 for(const row of fixture.sourceRows){
  try{observations.set(row.CODE,validateShowroomStockObservation(row.CODE,row,{now}));}
  catch{observations.set(row.CODE,null);}
 }
 assert.equal([...observations.values()].filter(Boolean).length,7);
 const before=reviewedWebsiteRows(),updated=overlayShowroomLiveStock(before,observations,{now});
 assert.equal(updated.length,before.length);
 for(let i=0;i<before.length;i++){
  const original=before[i],result=updated[i],known=Object.hasOwn(units,original.barcode);
  assert.equal(result.stockQty,known?fixture.sourceRows.find(row=>row.CODE===original.barcode).ONHAND:null);
  assert.equal(result.stockSource,known?'positill_live':'unavailable');
  assert.equal(result.stockCheckedAt,known?new Date(now).toISOString():null);
  for(const key of Object.keys(original))assert.deepEqual(result[key],original[key],`${original.sku}:${key}`);
 }
 const m200=updated.filter(row=>row.barcode==='M200');assert.equal(m200.length,14);assert.ok(m200.every(row=>row.stockQty===516));
});

test('a website-unit mismatch holds the reviewed shared pool without changing its source observation',()=>{
 const source=fixture.sourceRows.find(row=>row.CODE==='MC085-1'),observation=validateShowroomStockObservation(source.CODE,source,{now});
 const original=fixture.websiteRows.find(row=>row.barcode===source.CODE);
 const result=overlayShowroomLiveStock([original,{...original,sku:'REVIEWED-ALIAS',units_of_issue:'EACH'}],new Map([[source.CODE,observation]]),{now});
 assert.ok(result.every(row=>row.stockQty===null));assert.equal(observation.qty,72);
});

// Only a query/result seam is injected: stock handler, source validator,
// checkout resolver and browser stock consumer are the actual production code.
function publishedClient(rows){return {from(table){assert.equal(table,'website_stock');const query={
 select(){return query;},or(){return query;},eq(){return query;},limit(){return Promise.resolve({data:rows});},
 in(field,values){return Promise.resolve({data:rows.filter(row=>values.includes(row[field]))});}};return query;},
 async rpc(name){assert.equal(name,'get_website_product_availability');return {data:[]};}};}
function captureResponse(){return {headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};}
function sourceReader(row,clock){return codes=>readShowroomLiveStock(codes,{now:()=>clock,read:async code=>{assert.equal(code,row.CODE);return structuredClone(row);}});}

test('real stock API, checkout and browser consumer agree on all seven exact units without changing photos/prices or multiplying stock',async()=>{
 const clock=Date.now();
 for(const [code,expectedUnit] of Object.entries(units)){
  const source=fixture.sourceRows.find(row=>row.CODE===code),published=fixture.websiteRows.find(row=>row.barcode===code),before=structuredClone(published);
  const readStock=sourceReader(source,clock),result=captureResponse();
  await createStockHandler({authenticate:async()=>({id:'reviewed-test'}),approve:async()=>true,getClient:()=>publishedClient([published]),readStock})(
   {method:'GET',query:{sku:code,website_sku:published.sku}},result);
  assert.equal(result.code,200);assert.equal(result.headers['Cache-Control'],'no-store');assert.equal(result.data.qty,source.ONHAND-source.BOOKED);
  assert.equal(result.data.source_code,code);assert.equal(result.data.sku,published.sku);assert.equal(result.data.stock_source,'positill_live');
  const target=showroomStockTarget(published),observation=validateShowroomStock(result.data,target,clock);
  const browser=applyShowroomStock(published,{[target.pool]:observation},clock);
  assert.equal(browser.stockQty,source.ONHAND-source.BOOKED);assert.equal(browser.availability.canOrder,source.ONHAND-source.BOOKED>0);
  const [line]=await resolveStandardPrices([{qty:2,product:{sku:published.sku,code:published.barcode,checkoutSnapshot:{unitPrice:published.price,stockQty:source.ONHAND-source.BOOKED}}}],{index:publishedClient([published]),readStock});
  assert.equal(line.qty,2);assert.equal(line.product.stockOnHand,source.ONHAND-source.BOOKED);assert.equal(line.product.unitsOfIssue,expectedUnit);
  assert.equal(line.product.price,published.price);assert.equal(line.product.image,published.image_url_one);
  for(const key of ['image_url_one','title','price','units_of_issue','barcode','sku'])assert.deepEqual(browser[key],published[key]);
  assert.deepEqual(published,before);
 }
});

test('changed exact source descriptions or numeric units stay unknown through API/browser and retain explicit checkout staff-request policy',async()=>{
 const clock=Date.now();
 for(const code of Object.keys(units)){
  const original=fixture.sourceRows.find(row=>row.CODE===code),published=fixture.websiteRows.find(row=>row.barcode===code);
  for(const source of [{...original,DESCR:'DIFFERENT PRODUCT'},{...original,UNITS:original.UNITS+'0'}]){
   const readStock=sourceReader(source,clock),result=captureResponse();
   await createStockHandler({authenticate:async()=>({id:'reviewed-test'}),approve:async()=>true,getClient:()=>publishedClient([published]),readStock})(
    {method:'GET',query:{sku:code,website_sku:published.sku}},result);
   assert.equal(result.code,200);assert.equal(result.data.qty,null);assert.equal(result.data.stock_source,'unavailable');assert.equal(result.data.checked_at,null);
   const target=showroomStockTarget(published);assert.throws(()=>validateShowroomStock(result.data,target,clock),/unavailable/);
   assert.equal(applyShowroomStock(published,{},clock).availability.canOrder,false);
   const [line]=await resolveStandardPrices([{qty:2,product:{sku:published.sku,code,checkoutSnapshot:{unitPrice:published.price,stockQty:original.ONHAND}}}],{index:publishedClient([published]),readStock});
   assert.equal(line.qty,2);assert.equal(line.product.stockOnHand,null);assert.equal(line.product.stockRequest.stockUnverified,true);
   assert.equal(line.product.price,published.price);assert.equal(line.product.image,published.image_url_one);
  }
 }
});

test('M200 mixed before-state holds all fourteen; only approved eleven unit fields align while every cached balance, price and photo remains unchanged',()=>{
 const source=fixture.sourceRows.find(row=>row.CODE==='M200'),observation=validateShowroomStockObservation('M200',source,{now});
 const original=fixture.websiteRows.filter(row=>row.barcode==='M200'),observations=new Map([['M200',observation]]);
 assert.equal(original.length,14);assert.ok(overlayShowroomLiveStock(original,observations,{now}).every(row=>row.stockQty===null));
 const aligned=reviewedWebsiteRows().filter(row=>row.barcode==='M200');let changes=0;
 for(let i=0;i<original.length;i++){
  for(const key of Object.keys(original[i])){
   if(key==='units_of_issue'&&original[i][key]==='EACH'){assert.equal(aligned[i][key],'100');changes++;}
   else assert.deepEqual(aligned[i][key],original[i][key]);
  }
 }
 assert.equal(changes,11);
 const refreshed=overlayShowroomLiveStock(aligned,observations,{now});
 assert.ok(refreshed.every(row=>row.stockQty===516&&row.stockSource==='positill_live'));
 assert.equal(observations.size,1);assert.equal(observation.qty,516);
});

test('actual M200 checkout aggregates two300 requests into one516 source pool with84 shared shortfall, without unit or variant expansion',async()=>{
 const rows=reviewedWebsiteRows().filter(row=>row.barcode==='M200'),selected=rows.slice(0,2),source=fixture.sourceRows.find(row=>row.CODE==='M200');
 const clock=Date.now();let reads=0;
 const readStock=async codes=>{reads++;assert.deepEqual(codes,['M200']);return sourceReader(source,clock)(codes);};
 const lines=await resolveStandardPrices(selected.map(row=>({qty:300,product:{sku:row.sku,code:'M200',checkoutSnapshot:{unitPrice:53,stockQty:516}}})),{index:publishedClient(rows),readStock});
 assert.equal(reads,1);assert.equal(lines.length,2);
 for(let i=0;i<lines.length;i++){
  const line=lines[i];assert.equal(line.qty,300);assert.equal(line.product.stockOnHand,516);assert.equal(line.product.unitsOfIssue,'100');
  assert.equal(line.product.price,53);assert.equal(line.product.image,selected[i].image_url_one);
  assert.equal(line.product.stockRequest.sharedStock,true);assert.equal(line.product.stockRequest.requestedQty,600);
  assert.equal(line.product.stockRequest.availableQty,516);assert.equal(line.product.stockRequest.shortfallQty,84);
 }
});
