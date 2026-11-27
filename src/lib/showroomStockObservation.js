import {normalizeUnitsOfIssue} from '../../lib/selling-unit.mjs';
import {resolveProductAvailability} from '../../lib/product-availability.mjs';

export const SHOWROOM_STOCK_MAX_AGE = 30000;
const code=value=>String(value||'').trim().toUpperCase();
export function showroomStockTarget(product){
  const sku=code(product?.sku||product?.websiteSku||product?.id||product?.code);
  if(!sku||product?.isExtendedRange||product?.isVariantGroup||['8-34','8640000274'].includes(sku))return null;
  const sourceCode=code(product.barcode||product.code||sku),unit=normalizeUnitsOfIssue(product.unitsOfIssue||product.units_of_issue||product.casePack||'');
  return {sku,sourceCode,unit,pool:JSON.stringify([sourceCode,unit]),identity:JSON.stringify([sku,sourceCode,unit,product.sourceIdentitySHA||product.instoreSourceIdentitySHA||'',product.imageSourceKey||''])};
}
export function showroomStockTargets(product){
  const rows=product?.isVariantGroup?product.variants||[]:[product];
  return [...new Map(rows.map(showroomStockTarget).filter(Boolean).map(target=>[target.pool,target])).values()];
}
export function validateShowroomStock(data,target,now=Date.now()){
  const checked=Date.parse(data?.checked_at);
  if(data?.stock_source!=='positill_live'||code(data?.sku)!==target.sku||code(data?.source_code)!==target.sourceCode||!Number.isSafeInteger(data?.qty)||data.qty<0||data.available_stock!==data.qty||typeof data.checked_at!=='string'||!Number.isFinite(checked)||now-checked< -1000||now-checked>SHOWROOM_STOCK_MAX_AGE)throw Error('Current stock unavailable');
  return {status:'verified',sourceCode:target.sourceCode,qty:data.qty,checkedAt:data.checked_at,receivedAt:now};
}
export function applyShowroomStock(product,records,now=Date.now()){
  if(product?.isVariantGroup)return {...product,variants:(product.variants||[]).map(row=>applyShowroomStock(row,records,now))};
  const target=showroomStockTarget(product);if(!target)return product;
  const saved=records?.[target.pool],fresh=saved?.sourceCode===target.sourceCode&&saved?.status==='verified'&&now-Date.parse(saved.checkedAt)>=-1000&&now-Date.parse(saved.checkedAt)<SHOWROOM_STOCK_MAX_AGE;
  const observation=fresh?saved:{status:saved?.status==='checking'?'checking':'unavailable',sourceCode:target.sourceCode,qty:null,checkedAt:null};
  const qty=fresh?saved.qty:null;
  const availability=resolveProductAvailability({stockQty:qty,toOrder:Boolean(product.toOrder||product.to_order||product.orderableWhenOutOfStock||product.orderable_when_out_of_stock),incoming:{...product,...product.availability}});
  if(qty===null&&!availability.canOrder){availability.label='Stock unavailable';availability.guidance='Please check again. Availability is confirmed when packing.';}
  return {...product,stockQty:qty,stockOnHand:qty,stock_qty:qty,available_stock:qty,availability,showroomStockObservation:observation};
}

// Shared only within one authenticated account epoch. Alias rows use one
// source pool; subscribers never add their quantities into separate balances.
export function createShowroomStockReader({load,session,assertSession,now=Date.now,limit=3,maxPending=256}={}){
  const entries=new Map(),pending=[];let active=0;
  const abort=()=>Object.assign(Error('Stock check cancelled'),{name:'AbortError'});
  function drain(){while(active<limit&&pending.length){const job=pending.shift();if(job.controller.signal.aborted){job.reject(abort());continue;}active++;
    Promise.resolve().then(()=>{assertSession(job.actor);return load(job.target,{signal:job.controller.signal});}).then(data=>{assertSession(job.actor);if(job.controller.signal.aborted)throw abort();const value=validateShowroomStock(data,job.target,now());job.value=value;job.resolve(value);},job.reject).catch(job.reject).finally(()=>{active--;job.finished=true;if(!job.value&&entries.get(job.key)===job)entries.delete(job.key);drain();});}}
  return function read(target,{signal,force=false}={}){
    const actor=session(),key=JSON.stringify([actor.userId,actor.epoch,target.pool]);assertSession(actor);
    let entry=entries.get(key);if(entry?.controller.signal.aborted){entries.delete(key);entry=null;}if(entry?.value&&(force||now()-Date.parse(entry.value.checkedAt)>SHOWROOM_STOCK_MAX_AGE)){entries.delete(key);entry=null;}
    if(!entry){if(pending.length>=maxPending)return Promise.reject(Error('Stock checks busy'));
      entry={key,target,actor,controller:new AbortController(),users:0,finished:false};entry.promise=new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;});entries.set(key,entry);pending.push(entry);drain();}
    entry.users++;const current=entry;
    return new Promise((resolve,reject)=>{let done=false;function finish(error,value){if(done)return;done=true;signal?.removeEventListener('abort',cancel);current.users--;if(!current.users&&!current.finished&&!current.value)current.controller.abort();if(error)reject(error);else{try{assertSession(actor);resolve(value);}catch(e){reject(e);}}}const cancel=()=>finish(abort());
      if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});current.promise.then(value=>finish(null,value),error=>finish(error));});
  };
}
