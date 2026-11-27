import {validateShowroomStockObservation} from './showroom-live-stock.mjs';

export const SHOWROOM_STOCK_REPORT='stock.website_balances';
const PROTOCOL='proto.sql-report.v1';
const SPECIAL=new Set(['8-34','8640000274']);
const MAX_BYTES=262144;
const code=value=>{
 if(typeof value!=='string'||[...value].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)||!/^[A-Z0-9][A-Z0-9._/@&-]{0,63}$/.test(value.trim().toUpperCase()))throw Error('Invalid exact stock code');
 return value.trim().toUpperCase();
};
const sameCodes=(values,expected)=>Array.isArray(values)&&values.length===expected.length
 &&new Set(values).size===values.length&&values.every(value=>typeof value==='string'&&expected.includes(value));

async function reportBatch(skus,{env=process.env,transport=globalThis.fetch,signal}={}){
 const base=new URL(String(env.STOCK_SQL_BRIDGE_URL||'')),key=String(env.STOCK_SQL_BRIDGE_KEY||'').trim();
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!key)throw Error('Stock report unavailable');
 const response=await transport(base.href.replace(/\/$/,'')+'/reports/run',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal,
  headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify({reportId:SHOWROOM_STOCK_REPORT,params:{skus}})});
 if(!response.ok||!response.body||response.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('Stock report unavailable');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw Error('Stock report response exceeds limit');chunks.push(value);}}
 finally{void reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return JSON.parse(new TextDecoder().decode(bytes));
}

export function validateShowroomStockBatch(value,requested,{now=Date.now(),maxAgeMs=30000}={}){
 if(!Array.isArray(requested)||requested.length<1||requested.length>300||new Set(requested).size!==requested.length
  ||requested.some(value=>code(value)!==value)||!Number.isSafeInteger(now)||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<0||maxAgeMs>30000)throw Error('Invalid stock report cohort');
 if(value?.ok!==true||value.schemaVersion!==PROTOCOL||value.report?.id!==SHOWROOM_STOCK_REPORT
  ||!sameCodes(value.params?.skus,requested)||!Array.isArray(value.rows)||value.rows.length>requested.length||value.rowCount!==value.rows.length
  ||value.meta?.source!=='POSWINSQL'||value.meta.readOnly!==true||value.meta.backendCompatible!==true
  ||value.meta.requestedCount!==requested.length||value.meta.rowCapReached!==false)throw Error('Unconfirmed stock report');
 const generated=Date.parse(value.meta.generatedAt);
 if(!Number.isFinite(generated)||now-generated<0||now-generated>maxAgeMs)throw Error('Stock report is not current');
 const result=new Map(requested.map(value=>[value,null])),seen=new Set();
 for(const row of value.rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).sort().join(',')!=='BOOKED,CODE,ONHAND,UNITS')throw Error('Unexpected stock report fields');
  const identity=code(row.CODE);
  if(!result.has(identity)||seen.has(identity))throw Error('Unexpected or duplicate stock report identity');
  seen.add(identity);
  const observation=validateShowroomStockObservation(identity,row,{now:generated});
  // Retain the source report timestamp, rather than re-stamping cached bytes.
  result.set(identity,{...observation,stockCheckedAt:new Date(generated).toISOString()});
 }
 if(!sameCodes(value.meta.missingCodes,requested.filter(value=>!seen.has(value))))throw Error('Stock report missing-code proof differs');
 return result;
}

// A server-only read-through over already published source identities. This
// uses the one fixed SELECT-only report, never thousands of per-code requests.
export async function readShowroomBatchStock(codes,{readBatch=reportBatch,env=process.env,transport=globalThis.fetch,
 batchSize=300,maxCodes=10000,concurrency=2,timeoutMs=8000,totalTimeoutMs=15000,now=Date.now}={}){
 if(!Array.isArray(codes)||!Number.isInteger(batchSize)||batchSize<1||batchSize>300
  ||!Number.isInteger(maxCodes)||maxCodes<1||maxCodes>10000||!Number.isInteger(concurrency)||concurrency<1||concurrency>2
  ||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000||!Number.isInteger(totalTimeoutMs)||totalTimeoutMs<1||totalTimeoutMs>15000
  ||typeof readBatch!=='function'||typeof now!=='function')throw Error('Invalid bounded stock report read');
 const unique=[...new Set(codes.map(code))];if(unique.length>maxCodes)throw Error('Too many published stock identities');
 const result=new Map(unique.map(value=>[value,null])),eligible=unique.filter(value=>!SPECIAL.has(value)),batches=[];
 for(let from=0;from<eligible.length;from+=batchSize)batches.push(eligible.slice(from,from+batchSize));
 const deadline=now()+totalTimeoutMs;let next=0;
 const worker=async()=>{while(next<batches.length){const cohort=batches[next++];if(now()>=deadline)continue;
  const controller=new AbortController();let timer;
  try{
   const wait=Math.min(timeoutMs,Math.max(1,deadline-now()));
   const value=await Promise.race([Promise.resolve().then(()=>readBatch(cohort,{env,transport,signal:controller.signal})),new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(Error('Stock report deadline'));},wait);
   })]);
   if(now()>=deadline)continue;
   const observations=validateShowroomStockBatch(value,cohort,{now:now()});
   for(const [identity,observation]of observations)result.set(identity,observation);
  }catch{/* A failed cohort is unknown; no stale or per-code fallback. */}
  finally{clearTimeout(timer);controller.abort();}
 }};
 await Promise.all(Array.from({length:Math.min(concurrency,batches.length)},worker));return result;
}
