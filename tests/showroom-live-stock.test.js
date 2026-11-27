import test from 'node:test';
import assert from 'node:assert/strict';
import {showroomSourceCode,validateShowroomStockObservation,readShowroomLiveStock,overlayShowroomLiveStock} from '../lib/showroom-live-stock.mjs';

const code='8640000255',stamp=Date.UTC(2026,10,27,20),clock=()=>stamp;
const raw=(CODE=code,ONHAND=70,BOOKED=2,UNITS='PKT,12')=>({CODE,ONHAND,BOOKED,UNITS});
const product=(extra={})=>({id:code,sku:code,code,barcode:code,price:27.5,unitsOfIssue:'PACK 12',stockQty:96,stockOnHand:96,inStock:true,image:'original-main.jpg',images:['original-main.jpg','alternate.jpg'],toOrder:false,...extra});
const observation=(row=raw())=>validateShowroomStockObservation(row.CODE,row,{now:stamp});

test('verified Motarro symbol codes retain exact source identity and source balances',async()=>{
 const values=new Map([['ME095-@',25],['ME095-&',65]]);
 const result=await readShowroomLiveStock([...values.keys()],{now:clock,read:async code=>raw(code,values.get(code),0,'EACH')});
 for(const [sourceCode,qty]of values){const current=result.get(sourceCode);assert.equal(current.qty,qty);assert.equal(current.sourceUnits,'EACH');assert.equal(current.sourceCode,sourceCode);assert.equal(showroomSourceCode({sku:sourceCode,barcode:sourceCode}),sourceCode);}
 for(const code of ["CODE'",'CODE,OTHER','CODE\u0000','CODE\nOTHER','CODE\n','\tCODE'])await assert.rejects(()=>readShowroomLiveStock([code],{read:async()=>{throw Error('Not reached');}}));
});

test('255 current exact observation replaces96 with68 without any mirror, price, unit or image mutation',async()=>{
 let calls=0;const records=await readShowroomLiveStock([code],{read:async value=>{calls++;assert.equal(value,code);return raw();},now:clock});
 const original=product(),before=structuredClone(original),[actual]=overlayShowroomLiveStock([original],records,{now:stamp});
 assert.equal(calls,1);assert.equal(actual.stockQty,68);assert.equal(actual.stockOnHand,68);assert.equal(actual.stockSource,'positill_live');assert.equal(actual.stockCheckedAt,new Date(stamp).toISOString());
 for(const key of ['id','sku','code','barcode','price','unitsOfIssue','image','images','toOrder'])assert.deepEqual(actual[key],original[key]);
 assert.deepEqual(original,before);assert.equal(actual.availability.state,'in_stock');
});

test('only exact authoritative barcode/code mapping identifies a shared source',()=>{
 assert.equal(showroomSourceCode(product({sku:'255-RED',id:'255-RED'})),code);
 assert.equal(showroomSourceCode({sku:' OTHER ',barcode:''}),'OTHER');
 for(const row of [{sku:'OK',code:'OTHER',barcode:code},{sku:'BAD?'},{barcode:'HTTPS://foreign.invalid'},{barcode:1}])assert.throws(()=>showroomSourceCode(row));
 assert.equal(showroomSourceCode({sku:'ALIAS',barcode:' 8640000255 ',code:'8640000255'}),code);
});

test('balances require exactCODE, complete decimal numbers and valid source units',()=>{
 for(const field of ['ONHAND','BOOKED'])for(const value of [null,undefined,'',' ',true,false,'NaN','Infinity','0x10',NaN,Infinity,[],{}])assert.throws(()=>observation({...raw(),[field]:value}));
 for(const row of [raw('OTHER'),raw(code,20,-1),raw(code,20,0,''),raw(code,20,0,'UNKNOWN'),raw(code,Number.MAX_SAFE_INTEGER+1,0)])assert.throws(()=>validateShowroomStockObservation(code,row,{now:stamp}));
 assert.equal(observation(raw(code,'70.9','2.1')).qty,68);
});

test('negative raw onhand and oversold balances remain diagnostic but orderable quantity never negative',()=>{
 for(const [onHand,booked,available] of [[-3,0,-3],[2,5,-3],[0,0,0]]){
  const current=observation(raw(code,onHand,booked));assert.equal(current.onHand,onHand);assert.equal(current.available,available);assert.equal(current.qty,0);
  const [actual]=overlayShowroomLiveStock([product()],new Map([[code,current]]),{now:stamp});assert.equal(actual.stockQty,0);assert.equal(actual.inStock,false);assert.equal(actual.availability.canOrder,false);
 }
});

test('deduplicates canonical pools with a maximum of four concurrent exact reads',async()=>{
 let active=0,peak=0;const calls=[];const codes=Array.from({length:12},(_,i)=>'SKU'+i);
 const result=await readShowroomLiveStock([...codes,code,code],{now:clock,read:async value=>{active++;peak=Math.max(peak,active);calls.push(value);await new Promise(resolve=>setTimeout(resolve,2));active--;return raw(value);}});
 assert.equal(result.size,13);assert.equal(calls.length,13);assert.ok(peak<=4);assert.ok(peak>1);assert.equal(calls.filter(value=>value===code).length,1);
});

test('invalid batch bounds fail before any source read',async()=>{
 let calls=0;const options={read:async()=>{calls++;return raw();}};
 for(const [codes,extra] of [[['BAD?'],{}],[Array.from({length:101},(_,i)=>'SKU'+i),{}],[[code],{concurrency:5}],[[code],{timeoutMs:8001}],[[code],{totalTimeoutMs:20001}],[[code],{maxCodes:251}]])await assert.rejects(()=>readShowroomLiveStock(codes,{...options,...extra}));
 assert.equal(calls,0);
});

test('explicit checkout cohort admits250unique pools once and rejects251 before reads',async()=>{
 const codes=Array.from({length:250},(_,i)=>'ORDER'+i);let calls=0;
 const result=await readShowroomLiveStock([...codes,codes[0]],{maxCodes:250,now:clock,read:async value=>{calls++;return raw(value);}});
 assert.equal(result.size,250);assert.equal(calls,250);assert.ok([...result.values()].every(value=>value.qty===68));
 await assert.rejects(()=>readShowroomLiveStock([...codes,'ORDER250'],{maxCodes:250,read:async()=>{throw Error('Not reached');}}));
});

test('source failures/wrong identities never fall back to recorded96 or fabricate zero',async()=>{
 for(const read of [async()=>{throw Error('offline');},async()=>raw('OTHER'),async()=>raw(code,null),async()=>null]){
  const records=await readShowroomLiveStock([code],{read,now:clock});assert.equal(records.get(code),null);
  const [actual]=overlayShowroomLiveStock([product()],records,{now:stamp});assert.equal(actual.stockQty,null);assert.equal(actual.stockOnHand,null);assert.equal(actual.inStock,false);assert.equal(actual.stockSource,'unavailable');assert.equal(actual.stockCheckedAt,null);assert.equal(actual.availability.canOrder,false);
 }
});

test('request timeout and total deadline hold unknown even when injected reader ignores cancellation',async()=>{
 let calls=0;const start=Date.now();const result=await readShowroomLiveStock(['A','B','C'],{concurrency:1,timeoutMs:15,totalTimeoutMs:20,read:async()=>{calls++;return new Promise(()=>{});}});
 assert.ok(Date.now()-start<500);assert.ok(calls<=2);assert.deepEqual([...result.values()],[null,null,null]);
});

test('stock overlay rejects future/stale/mismatched observations with no previous confirmed fallback',()=>{
 const good=observation();
 for(const bad of [{...good,sourceCode:'OTHER'},{...good,stockCheckedAt:new Date(stamp+1).toISOString()},{...good,stockCheckedAt:new Date(stamp-30001).toISOString()},{...good,qty:96},{...good,stockSource:'website_cache'},null]){
  const [actual]=overlayShowroomLiveStock([product()],new Map([[code,bad]]),{now:stamp});assert.equal(actual.stockQty,null);assert.equal(actual.stockSource,'unavailable');
 }
});

test('barcode aliases share one observed pool and pack-equivalent quantities without multiplied stocks',()=>{
 const aliases=[product({id:'RED',sku:'RED',unitsOfIssue:'PKT,12'}),product({id:'GREEN',sku:'GREEN',unitsOfIssue:'PACK 12'})];
 const result=overlayShowroomLiveStock(aliases,new Map([[code,observation()]]),{now:stamp});
 assert.deepEqual(result.map(p=>p.stockQty),[68,68]);assert.deepEqual(result.map(p=>p.sku),['RED','GREEN']);assert.deepEqual(result.map(p=>p.unitsOfIssue),['PKT,12','PACK 12']);
});

test('one incompatible alias unit holds the represented shared pool instead of dividing or rewriting packs',()=>{
 const aliases=[product({sku:'RED'}),product({sku:'GREEN',unitsOfIssue:'EACH'})];
 const result=overlayShowroomLiveStock(aliases,new Map([[code,observation()]]),{now:stamp});
 assert.deepEqual(result.map(p=>p.stockQty),[null,null]);assert.deepEqual(result.map(p=>p.unitsOfIssue),['PACK 12','EACH']);
 const [missing]=overlayShowroomLiveStock([product({unitsOfIssue:null})],new Map([[code,observation()]]),{now:stamp});assert.equal(missing.stockQty,68);assert.equal(missing.unitsOfIssue,null);
});

test('known-zero and unknown keep existing To-order and incoming/landed policy without inventing stock or badges',()=>{
 for(const value of [null,observation(raw(code,0,0))]){
  const map=new Map([[code,value]]);
  const [toOrder]=overlayShowroomLiveStock([product({toOrder:true})],map,{now:stamp});assert.equal(toOrder.availability.state,'to_order');assert.equal(toOrder.availability.canOrder,true);assert.equal(toOrder.toOrder,true);
  const incoming={incomingStatus:'landed_awaiting_grv',incomingQty:10,incomingEta:'2026-12-01',allowPreorder:false};
  const [landed]=overlayShowroomLiveStock([product({availability:incoming})],map,{now:stamp});assert.equal(landed.availability.state,'landed');assert.equal(landed.availability.canOrder,true);assert.equal(landed.availability.incomingQty,10);assert.equal(landed.toOrder,false);
  const [transit]=overlayShowroomLiveStock([product({availability:{...incoming,incomingStatus:'on_the_way'}})],map,{now:stamp});assert.equal(transit.availability.state,'incoming');assert.equal(transit.availability.canOrder,false);
 }
});

test('special family, Instore and grouped presentation contracts are untouched by generic observations',async()=>{
 let calls=0;const map=await readShowroomLiveStock(['8-34','8640000274'],{read:async()=>{calls++;return raw();}});assert.equal(calls,0);
 const inputs=[product({code:'8-34',barcode:'8-34'}),product({code:'8640000274',barcode:'8640000274'}),product({isExtendedRange:true}),product({isVariantGroup:true})];
 const result=overlayShowroomLiveStock(inputs,map,{now:stamp});result.forEach((p,i)=>assert.equal(p,inputs[i]));
});

test('default bridge transport is read-only exact-code, bounded, credential-free browser isolation',async()=>{
 const seen=[];const env={STOCK_SQL_BRIDGE_URL:'https://bridge.example.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic-server-only'};
 const transport=async(url,options)=>{seen.push({url,options});return Response.json({row:raw()});};
 const result=await readShowroomLiveStock([code],{env,transport,now:clock});assert.equal(result.get(code).qty,68);assert.equal(seen.length,1);
 assert.equal(seen[0].url,'https://bridge.example.invalid/stmast');assert.equal(seen[0].options.method,'POST');assert.equal(seen[0].options.redirect,'error');assert.equal(seen[0].options.credentials,'omit');assert.deepEqual(JSON.parse(seen[0].options.body),{sku:code});
 for(const transport of [async()=>new Response('offline',{status:503}),async()=>new Response('x'.repeat(32769)),async()=>Response.json({row:raw('OTHER')})])assert.equal((await readShowroomLiveStock([code],{env,transport,now:clock})).get(code),null);
 let reads=0;assert.equal((await readShowroomLiveStock([code],{env:{...env,STOCK_SQL_BRIDGE_URL:'https://user:password@bridge.example.invalid'},transport:async()=>{reads++;return Response.json({row:raw()});}})).get(code),null);assert.equal(reads,0);
});
