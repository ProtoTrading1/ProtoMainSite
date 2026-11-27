import {CAT07_SKU,validateCat07Gallery} from '../lib/cat07-customer-gallery.mjs';
import {cat07ManifestHash} from '../lib/cat07-order-preview.mjs';
import {readArrivedBridgeRow} from './_arrived-stock.js';
import {positillUnitObservation} from '../lib/positill-selling-unit.mjs';
import {websitePriceFromExVat} from '../lib/catalogue-price.mjs';
const checked=Symbol('completed CAT07 family and current source');
const held=()=>{throw Object.assign(Error('The Christmas styles and current stock could not be verified. Please refresh this product.'),{status:409});};
export async function readCompletedCat07Receipt(client,row){
 if(row?.sku!==CAT07_SKU)held();
 const abort=new AbortController();let timer;
 try{
  const call=client.rpc('loader_cat07_family_publication_read_v1',{p_body:{sku:CAT07_SKU,destination:'instore'}});
  const pending=typeof call?.abortSignal==='function'?call.abortSignal(abort.signal):call;
  const {data,error}=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('Family read timeout'));},2500);})]);
  if(error)held();validateCat07Gallery(data);
  if(data.mainViewId!=='overview'||cat07ManifestHash(data)!==data.manifestHash
   ||row.barcode!==CAT07_SKU||row.image_source!=='nutstore'||row.image_review_status!=='verified'
   ||row.visibility_status!=='search_only'||row.is_active!==true||row.minimum_stock!==1
   ||row.image_source_key!=='cat07-family-v1:'+data.manifestHash
   ||row.image_url!==data.views.find(view=>view.id===data.mainViewId).image.url)held();
  return structuredClone(data);
 }catch{held();}finally{clearTimeout(timer);}
}
export function cat07CurrentSource(row,{now=Date.now()}={}){
 const unit=positillUnitObservation(CAT07_SKU,row);
 if(unit.unitsOfIssue!=='EACH'||!['ONHAND','BOOKED'].every(key=>['number','string'].includes(typeof row?.[key])&&String(row[key]).trim()!==''))held();
 const onHand=Number(row.ONHAND),booked=Number(row.BOOKED),available=onHand-booked,priceInclVat=websitePriceFromExVat(Number(row.PRICE_A));
 if(![onHand,booked,available].every(Number.isSafeInteger)||booked<0||!Number.isFinite(priceInclVat)||priceInclVat<=0)held();
 return {authority:'live-exact-code-observation',canonicalCode:CAT07_SKU,description:String(row.DESCR||'').trim(),units:'EACH',priceInclVat,onHand,booked,available,observedAt:new Date(now).toISOString()};
}
export async function verifyCat07Row(row,{client,read=readArrivedBridgeRow,env=process.env}={}){
 const receipt=await readCompletedCat07Receipt(client,row),source=cat07CurrentSource(await read(CAT07_SKU,{env}));
 return {...row,price:source.priceInclVat,available_stock:source.available,cat07Family:receipt,[checked]:{receipt,source}};
}
export function cat07RowProof(row){
 const proof=row?.[checked];
 if(!proof||row.sku!==CAT07_SKU||row.barcode!==CAT07_SKU
  ||row.available_stock!==proof.source.available||row.price!==proof.source.priceInclVat
  ||row.image_url!==proof.receipt.views[0].image.url
  ||row.image_source_key!=='cat07-family-v1:'+proof.receipt.manifestHash)return null;
 return proof;
}
export async function attachVerifiedCat07Rows(rows,{client,...options}={}){
 const matches=rows.filter(row=>row.sku===CAT07_SKU);if(!matches.length)return rows;
 let verified;try{if(matches.length!==1)held();verified=await verifyCat07Row(matches[0],{client,...options});}catch{return rows.filter(row=>row.sku!==CAT07_SKU);}
 return rows.map(row=>row.sku===CAT07_SKU?verified:row);
}
