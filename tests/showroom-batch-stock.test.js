import test from 'node:test';
import assert from 'node:assert/strict';
import {readShowroomBatchStock,validateShowroomStockBatch,SHOWROOM_STOCK_REPORT} from '../lib/showroom-batch-stock.mjs';
const stamp=Date.UTC(2026,10,27,22),clock=()=>stamp;
const row=(CODE,ONHAND=70,BOOKED=2,UNITS='PKT,12',DESCR='Synthetic stock')=>({CODE,ONHAND,BOOKED,UNITS,DESCR});
const envelope=(codes,rows=codes.map(value=>row(value)))=>({ok:true,schemaVersion:'proto.sql-report.v1',engineVersion:'4.3.1',report:{id:SHOWROOM_STOCK_REPORT},params:{skus:codes},rows,rowCount:rows.length,meta:{source:'POSWINSQL',readOnly:true,generatedAt:new Date(stamp).toISOString(),durationMs:5,rowCapReached:false,backendCompatible:true,requestedCount:codes.length,missingCodes:codes.filter(value=>!rows.some(row=>row.CODE===value))}});

test('batch report preserves legitimate Motarro at/ampersand identities without allowing filter or control syntax',async()=>{
 let sent;const result=await readShowroomBatchStock(['ME095-@','ME095-&'],{now:clock,readBatch:async codes=>{sent=codes;return envelope(codes,[row('ME095-@',25,0,'EACH'),row('ME095-&',65,0,'EACH')]);}});
 assert.deepEqual(sent,['ME095-@','ME095-&']);assert.equal(result.get('ME095-@').qty,25);assert.equal(result.get('ME095-&').qty,65);assert.equal(result.get('ME095-&').sourceUnits,'EACH');
 for(const code of ["CODE'",'CODE,OTHER','CODE\u0000','CODE\nOTHER','CODE\n','\tCODE'])await assert.rejects(()=>readShowroomBatchStock([code],{readBatch:async()=>{throw Error('Not reached');}}));
});

test('all published source codes use bounded300-code cohorts rather than per-code fanout',async()=>{
 const codes=Array.from({length:7201},(_,i)=>'SKU'+i),batches=[];let active=0,peak=0;
 const result=await readShowroomBatchStock([...codes,'SKU0'],{now:clock,readBatch:async cohort=>{active++;peak=Math.max(peak,active);batches.push(cohort);await new Promise(resolve=>setTimeout(resolve,1));active--;return envelope(cohort);}});
 assert.equal(result.size,7201);assert.equal(batches.length,25);assert.ok(batches.every(batch=>batch.length<=300));assert.ok(peak<=2);assert.equal(result.get('SKU0').qty,68);assert.equal(result.get('SKU7200').sourceUnits,'PACK 12');
});

test('25596-cache is irrelevant: exact report source70minus2 supplies68 with source report timestamp',async()=>{
 const observations=await readShowroomBatchStock(['8640000255'],{now:clock,readBatch:async codes=>envelope(codes)});
 assert.equal(observations.get('8640000255').qty,68);assert.equal(observations.get('8640000255').stockCheckedAt,new Date(stamp).toISOString());
});

test('at most10000unique source pools;10001 rejected before any request',async()=>{
 let calls=0;const codes=Array.from({length:10000},(_,i)=>'S'+i);
 const result=await readShowroomBatchStock(codes,{now:clock,readBatch:async cohort=>{calls++;return envelope(cohort);}});assert.equal(result.size,10000);assert.equal(calls,34);
 await assert.rejects(()=>readShowroomBatchStock([...codes,'OVER'],{readBatch:async()=>{throw Error('No request');}}));
});

test('missing source codes stay unknown with exact missing-code proof; no fake zero',async()=>{
 const result=await readShowroomBatchStock(['A','B','C'],{now:clock,readBatch:async codes=>envelope(codes,[row('A'),row('C',0,0)])});
 assert.equal(result.get('A').qty,68);assert.equal(result.get('B'),null);assert.equal(result.get('C').qty,0);
});

test('no wrong, duplicate or unexpected fieldset may partially confirm its cohort',async()=>{
 for(const rows of [[row('A'),row('OTHER')],[row('A'),row('A')],[row('A'),{...row('B'),PRICE_A:23.91}],[row('A'),{CODE:'B',ONHAND:5,BOOKED:0,UNITS:'EACH'}]]){
  const result=await readShowroomBatchStock(['A','B'],{now:clock,readBatch:async codes=>envelope(codes,rows)});assert.deepEqual([...result.values()],[null,null]);
 }
});

test('known rows with missing balances or unverified units hold only themselves, not other source codes',async()=>{
 for(const bad of [row('B',null),row('B',5,-1),row('B',5,0,'UNKNOWN'),row('B',5,0,null),row('B',5,null,'EACH')]){
  const values=await readShowroomBatchStock(['A','B'],{now:clock,readBatch:async codes=>envelope(codes,[row('A'),bad])});assert.equal(values.get('A').qty,68);assert.equal(values.get('B'),null);
 }
 const codes=Array.from({length:300},(_,i)=>'COHORT'+i),rows=codes.map(value=>row(value));rows[150]=row(codes[150],5,0,'');
 const values=validateShowroomStockBatch(envelope(codes,rows),codes,{now:stamp});assert.equal([...values.values()].filter(Boolean).length,299);assert.equal(values.get(codes[150]),null);
});

test('existing exact PKT,00 exception resolves identically to the single-code path with actual description proof',()=>{
 const code='8640000227',expected='BALLOONS 12INCH PKT,100 WHITE';
 const values=validateShowroomStockBatch(envelope(['A',code],[row('A'),row(code,50,0,'PKT,00',expected)]),['A',code],{now:stamp});assert.equal(values.get('A').qty,68);assert.equal(values.get(code).sourceUnits,'PACK 100');assert.equal(values.get(code).qty,50);
 const held=validateShowroomStockBatch(envelope(['A',code],[row('A'),row(code,50,0,'PKT,00','Different source product')]),['A',code],{now:stamp});assert.equal(held.get('A').qty,68);assert.equal(held.get(code),null);
});

test('report identity, readonly, membership, schema, rowcount and complete envelope are mandatory',()=>{
 const good=envelope(['A']);
 const cases=[{...good,ok:false},{...good,schemaVersion:'other'},{...good,report:{id:'stock.other'}},{...good,params:{skus:['OTHER']}},{...good,rowCount:2},...['readOnly','backendCompatible'].map(field=>({...good,meta:{...good.meta,[field]:false}})),{...good,meta:{...good.meta,source:'OTHER'}},{...good,meta:{...good.meta,requestedCount:2}},{...good,meta:{...good.meta,missingCodes:['A']}},{...good,meta:{...good.meta,rowCapReached:true}}];
 for(const value of cases)assert.throws(()=>validateShowroomStockBatch(value,['A'],{now:stamp}));
 const newEngine={...good,engineVersion:'future-additive-engine'};assert.equal(validateShowroomStockBatch(newEngine,['A'],{now:stamp}).get('A').qty,68);
});

test('a stale/future/null source report timestamp cannot be re-stamped as a current observation',()=>{
 for(const generatedAt of [null,'invalid',new Date(stamp-30001).toISOString(),new Date(stamp+1).toISOString()]){const value=envelope(['A']);value.meta.generatedAt=generatedAt;assert.throws(()=>validateShowroomStockBatch(value,['A'],{now:stamp}));}
 const value=envelope(['A']);value.meta.generatedAt=new Date(stamp-5000).toISOString();assert.equal(validateShowroomStockBatch(value,['A'],{now:stamp}).get('A').stockCheckedAt,value.meta.generatedAt);
});

test('partial HTTP/report failure holds only affected cohorts with no alternate source fallback',async()=>{
 const result=await readShowroomBatchStock(['A','B','C','D'],{batchSize:2,now:clock,readBatch:async codes=>{if(codes.includes('C'))throw Error('offline');return envelope(codes);}});
 assert.equal(result.get('A').qty,68);assert.equal(result.get('B').qty,68);assert.equal(result.get('C'),null);assert.equal(result.get('D'),null);
});

test('signed raw balances stay diagnostic and stock qty follows ordinary clamp/floor semantics',()=>{
 const values=validateShowroomStockBatch(envelope(['A','B'],[row('A',-4,0),row('B',4.9,2.1)]),['A','B'],{now:stamp});
 assert.equal(values.get('A').onHand,-4);assert.equal(values.get('A').available,-4);assert.equal(values.get('A').qty,0);assert.equal(values.get('B').qty,2);
});

test('strict8-34 and CAT07 families never enter generic batch report',async()=>{
 let calls=0;const result=await readShowroomBatchStock(['8-34','8640000274'],{readBatch:async()=>{calls++;throw Error('Not allowed');}});
 assert.equal(calls,0);assert.deepEqual([...result.values()],[null,null]);
});

test('absolute and request deadline stop a cohort even when synthetic transport ignores cancellation',async()=>{
 let calls=0;const started=Date.now();const result=await readShowroomBatchStock(['A','B','C'],{batchSize:1,concurrency:1,timeoutMs:15,totalTimeoutMs:20,readBatch:async()=>{calls++;return new Promise(()=>{});}});
 assert.ok(Date.now()-started<500);assert.ok(calls<=2);assert.deepEqual([...result.values()],[null,null,null]);
});

test('invalid bounds/codes do not dispatch reports',async()=>{
 let calls=0;for(const [codes,extra]of [[['BAD?'],{}],[['A'],{batchSize:301}],[['A'],{concurrency:3}],[['A'],{totalTimeoutMs:15001}],[['A'],{timeoutMs:8001}],[['A'],{maxCodes:10001}]])await assert.rejects(()=>readShowroomBatchStock(codes,{...extra,readBatch:async()=>{calls++;throw Error('Not reached');}}));assert.equal(calls,0);
});

test('actual default transport sends only fixed read-only report and bounded published identities',async()=>{
 const env={STOCK_SQL_BRIDGE_URL:'https://bridge.example.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic-server-only'},seen=[];
 const transport=async(url,options)=>{seen.push({url,options});return Response.json(envelope(JSON.parse(options.body).params.skus));};
 const result=await readShowroomBatchStock(['A'],{env,transport,now:clock});assert.equal(result.get('A').qty,68);assert.equal(seen.length,1);assert.equal(seen[0].url,'https://bridge.example.invalid/reports/run');assert.equal(seen[0].options.method,'POST');assert.equal(seen[0].options.redirect,'error');assert.equal(seen[0].options.credentials,'omit');assert.deepEqual(JSON.parse(seen[0].options.body),{reportId:'stock.website_balances',params:{skus:['A']}});
 for(const transport of [async()=>new Response('x'.repeat(262145),{headers:{'content-type':'application/json'}}),async()=>new Response('{}',{status:503}),async()=>new Response('{}',{headers:{'content-type':'text/html'}}),async()=>Response.json({row:row('A')})])assert.equal((await readShowroomBatchStock(['A'],{env,transport,now:clock})).get('A'),null);
 let reads=0;assert.equal((await readShowroomBatchStock(['A'],{env:{...env,STOCK_SQL_BRIDGE_URL:'https://user:pass@bridge.example.invalid'},transport:async()=>{reads++;return Response.json(envelope(['A']));}})).get('A'),null);assert.equal(reads,0);
});
