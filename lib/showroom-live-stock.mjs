import {resolveProductAvailability} from './product-availability.mjs';
import {normalizeUnitsOfIssue} from './selling-unit.mjs';
import {positillUnitObservation} from './positill-selling-unit.mjs';

const CODE=/^[A-Z0-9][A-Z0-9._/@&-]{0,63}$/;
const SPECIAL=new Set(['8-34','8640000274']);
const exactCode=value=>{
 if(typeof value!=='string'||[...value].some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)||!CODE.test(value.trim().toUpperCase()))throw Error('Invalid exact source code');
 return value.trim().toUpperCase();
};
const supplied=value=>value!==undefined&&value!==null&&String(value).trim()!=='';

// Website SKU aliases may deliberately differ from their shared source barcode.
// Only the authoritative website row supplies this mapping, never a browser.
export function showroomSourceCode(row){
 if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Published identity required');
 const codes=[row.barcode,row.code].filter(supplied).map(exactCode);
 if(new Set(codes).size>1)throw Error('Published source identities disagree');
 return codes[0]||exactCode(row.sku||row.id);
}

function numeric(value){
 if(!['number','string'].includes(typeof value)||String(value).trim()===''
  ||String(value).trim().length>128||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(String(value).trim()))throw Error('Incomplete source balance');
 const number=Number(value);
 if(!Number.isFinite(number)||Math.abs(number)>Number.MAX_SAFE_INTEGER)throw Error('Invalid source balance');
 return number;
}

function decimal(value){
 const number=numeric(value),text=String(value).trim();
 const match=/^([-+]?)(\d*)(?:\.(\d*))?(?:e([-+]?\d+))?$/i.exec(text);
 const exponent=Number(match[4]||0);
 if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>324)throw Error('Invalid decimal balance');
 let scale=(match[3]||'').length-exponent;
 let numerator=BigInt((match[2]||'0')+(match[3]||''))*(match[1]==='-'?-1n:1n);
 if(scale<0){numerator*=10n**BigInt(-scale);scale=0;}
 return {number,text,numerator,scale};
}

function exactBalance(onHandValue,bookedValue){
 const onHand=decimal(onHandValue),booked=decimal(bookedValue),scale=Math.max(onHand.scale,booked.scale);
 if(booked.numerator<0n)throw Error('Invalid booked balance');
 const numerator=onHand.numerator*10n**BigInt(scale-onHand.scale)-booked.numerator*10n**BigInt(scale-booked.scale);
 const negative=numerator<0n,digits=(negative?-numerator:numerator).toString().padStart(scale+1,'0');
 const text=(negative?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);
 const available=Number(text),qty=numerator>0n?Number(numerator/(10n**BigInt(scale))):0;
 if(!Number.isFinite(available)||Math.abs(available)>Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(qty))throw Error('Invalid source balance');
 return {onHand:onHand.number,booked:booked.number,available,qty,balanceProof:{onHand:onHand.text,booked:booked.text}};
}

export function validateShowroomStockObservation(sourceCode,row,{now=Date.now()}={}){
 const code=exactCode(sourceCode);
 if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid observation clock');
 if(exactCode(row?.CODE)!==code)throw Error('Source identity changed');
 const balance=exactBalance(row.ONHAND,row.BOOKED);
 const unit=positillUnitObservation(code,row);
 return {sourceCode:code,...balance,
  sourceUnits:unit.unitsOfIssue,sourceUnitsRaw:unit.unitsOfIssueRaw,
  stockSource:'positill_live',stockCheckedAt:new Date(now).toISOString()};
}

async function readBridge(code,{env=process.env,transport=globalThis.fetch,signal}={}){
 const base=new URL(String(env.STOCK_SQL_BRIDGE_URL||''));
 if(base.protocol!=='https:'||base.username||base.password||base.search||base.hash||!String(env.STOCK_SQL_BRIDGE_KEY||'').trim())throw Error('Stock reader unavailable');
 const response=await transport(base.href.replace(/\/$/,'')+'/stmast',{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',signal,
  headers:{'content-type':'application/json','x-api-key':String(env.STOCK_SQL_BRIDGE_KEY).trim()},body:JSON.stringify({sku:code})});
 if(!response.ok||!response.body)throw Error('Source read unavailable');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768)throw Error('Source response too large');chunks.push(value);}}
 finally{void reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const value=JSON.parse(new TextDecoder().decode(bytes));return value?.row??value;
}

// No persistent result cache or storage writes. Call only after authenticating
// and resolving website identities. Each unique source pool is read once.
export async function readShowroomLiveStock(codes,{read=readBridge,env=process.env,transport=globalThis.fetch,
 maxCodes=100,concurrency=4,timeoutMs=8000,totalTimeoutMs=20000,now=Date.now}={}){
 if(!Array.isArray(codes)||!Number.isInteger(maxCodes)||maxCodes<1||maxCodes>250
  ||!Number.isInteger(concurrency)||concurrency<1||concurrency>4||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000
  ||!Number.isInteger(totalTimeoutMs)||totalTimeoutMs<1||totalTimeoutMs>20000||typeof read!=='function'||typeof now!=='function')throw Error('Invalid bounded source read');
 const unique=[...new Set(codes.map(exactCode))];
 if(unique.length>maxCodes)throw Error('Too many source codes');
 const observations=new Map(unique.map(code=>[code,null]));let next=0;const deadline=now()+totalTimeoutMs;
 const worker=async()=>{while(next<unique.length){const code=unique[next++];if(SPECIAL.has(code)||now()>=deadline)continue;
  const controller=new AbortController();let timer;
  try{
   const remaining=Math.min(timeoutMs,Math.max(1,deadline-now()));
   const raw=await Promise.race([Promise.resolve().then(()=>read(code,{env,transport,signal:controller.signal})),new Promise((_,reject)=>{
    timer=setTimeout(()=>{controller.abort();reject(Error('Source deadline reached'));},remaining);
   })]);
   if(now()>=deadline)continue;
   observations.set(code,validateShowroomStockObservation(code,raw,{now:now()}));
  }catch{/* Unknown is not zero and never a confirmed stale balance. */}
  finally{clearTimeout(timer);controller.abort();}
 }};
 await Promise.all(Array.from({length:Math.min(concurrency,unique.length)},worker));return observations;
}

function usable(observation,code,{now,maxAgeMs}){
 if(!observation||observation.sourceCode!==code||observation.stockSource!=='positill_live'
  ||!Number.isSafeInteger(observation.qty)||observation.qty<0||!Number.isFinite(observation.onHand)||!Number.isFinite(observation.booked)
  ||observation.booked<0||typeof observation.sourceUnits!=='string'||!observation.sourceUnits.trim())return false;
 try{
  const proof=observation.balanceProof;
  if(!proof||Object.keys(proof).sort().join(',')!=='booked,onHand'||typeof proof.onHand!=='string'||typeof proof.booked!=='string')return false;
  const exact=exactBalance(proof.onHand,proof.booked);
  if(exact.onHand!==observation.onHand||exact.booked!==observation.booked||exact.available!==observation.available||exact.qty!==observation.qty)return false;
 }catch{return false;}
 const stamp=Date.parse(observation.stockCheckedAt);
 return Number.isFinite(stamp)&&now-stamp>=0&&now-stamp<=maxAgeMs;
}

function unit(row){
 if(row.stockUnitConfigured===false)return '';
 const value=row.unitsOfIssue??row.units_of_issue;
 if(!supplied(value))return '';
 if(typeof value!=='string')return '';
 return normalizeUnitsOfIssue(value,'');
}

export function overlayShowroomLiveStock(products,observations,{now=Date.now(),maxAgeMs=30000}={}){
 if(!Array.isArray(products)||!(observations instanceof Map)||!Number.isSafeInteger(now)||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<0||maxAgeMs>30000)throw Error('Invalid stock overlay');
 const prepared=products.map(product=>{
  if(product?.isExtendedRange||product?.isVariantGroup)return {product,skip:true};
  let code;try{code=showroomSourceCode(product);}catch{return {product,invalid:true};}
  if(SPECIAL.has(code))return {product,skip:true};
  const observation=observations.get(code),normalizedUnit=unit(product);
  return {product,code,observation,normalizedUnit,valid:usable(observation,code,{now,maxAgeMs})};
 });
 // One source cannot mean EACH on one alias and PACK12 on another. Hold the
 // whole represented pool instead of allocating independent apparent stocks.
 const conflicts=new Set();
 for(const entry of prepared){if(entry.skip||entry.invalid)continue;
  if(entry.normalizedUnit!==null&&(!entry.valid||entry.normalizedUnit!==entry.observation.sourceUnits))conflicts.add(entry.code);
 }
 return prepared.map(({product,skip,invalid,code,observation,valid})=>{
  if(skip)return product;
  const confirmed=!invalid&&valid&&!conflicts.has(code),qty=confirmed?observation.qty:null;
  const toOrder=!!(product?.toOrder||product?.to_order||product?.orderableWhenOutOfStock||product?.orderable_when_out_of_stock);
  const availability=resolveProductAvailability({stockQty:qty,toOrder,incoming:product?.availability||product});
  return {...product,stockQty:qty,stockOnHand:qty,inStock:confirmed&&qty>0,availability,
   stockSource:confirmed?'positill_live':'unavailable',stockCheckedAt:confirmed?observation.stockCheckedAt:null};
 });
}
