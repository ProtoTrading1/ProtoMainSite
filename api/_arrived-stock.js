import {arrivedStockAvailability} from '../lib/arrived-stock-availability.mjs';
import {positillUnitObservation} from '../lib/positill-selling-unit.mjs';
import {websitePriceFromExVat} from '../lib/catalogue-price.mjs';
export const arrivedStockEnabled=(env=process.env)=>env.INSTORE_ARRIVED_STOCK_ENABLED==='1';
export async function readArrivedStockRecords(client,codes,{env=process.env}={}){
 const map=new Map();if(!arrivedStockEnabled(env)||!codes.length)return map;
 const unique=[...new Set(codes)];
 for(let from=0;from<unique.length;from+=500){const {data,error}=await client.rpc('arrived_stock_receipts_v1',{p_action:'states',p_body:{codes:unique.slice(from,from+500)}});
  if(error||!Array.isArray(data))throw Error('Arrived stock could not be verified.');
  for(const row of data){if(!unique.includes(row.code)||map.has(row.code)||!['active','receiving-recorded'].includes(row.status))throw Error('Arrived stock returned an invalid product.');map.set(row.code,row);}
 }return map;
}
export function effectiveArrivedStock(sku,row,arrival){
 if(!arrival)return null;
 const unit=positillUnitObservation(sku,row);
 if(arrival.code!==sku||!['active','receiving-recorded'].includes(arrival.status))throw Error('Arrived stock does not match this product.');
 for(const field of ['ONHAND','BOOKED'])if(!['number','string'].includes(typeof row?.[field])||String(row[field]).trim()==='')throw Error('Current Positill stock is missing.');
 const onHand=Number(row.ONHAND),booked=Number(row.BOOKED);
 const stock=arrivedStockAvailability(arrival,{canonicalCode:sku,unitsRaw:row.UNITS,onHand,booked,available:onHand-booked},{receivingRecorded:arrival.status==='receiving-recorded'});
 const price=websitePriceFromExVat(Number(row.PRICE_A));if(!Number.isFinite(price)||price<=0)throw Error('A current Positill price is required.');
 return {...unit,qty:stock.available,price,availability:{state:stock.available>0?'in_stock':'out_of_stock',label:stock.available>0?'In stock':'Out of stock',canOrder:stock.available>0}};
}
export async function readArrivedBridgeRow(sku,{env=process.env,transport=globalThis.fetch}={}){
 const url=String(env.STOCK_SQL_BRIDGE_URL||'').trim().replace(/\/$/,''),key=String(env.STOCK_SQL_BRIDGE_KEY||'').trim();
 if(!url.startsWith('https://')||!key)throw Error('Current Positill stock is unavailable.');
 const response=await transport(url+'/stmast',{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify({sku}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Current Positill stock could not be checked.');return (await response.json())?.row;
}
export async function overlayArrivedStock(rows,{client,env=process.env,read=readArrivedBridgeRow}={}){
 if(!arrivedStockEnabled(env))return rows;
 const records=await readArrivedStockRecords(client,rows.map(row=>String(row.sku||'').trim().toUpperCase()),{env});
 const out=rows.map(row=>({...row}));let next=0;const deadline=Date.now()+20000;
 const worker=async()=>{while(next<out.length){const index=next++,row=out[index],sku=String(row.sku||'').trim().toUpperCase(),arrival=records.get(sku);if(!arrival)continue;
   try{if(Date.now()>deadline)throw Error('Arrived-stock refresh deadline reached');const current=effectiveArrivedStock(sku,await read(sku,{env}),arrival);row.available_stock=current.qty;row.price=current.price;}
   catch{row.available_stock=0;}
 }};await Promise.all(Array.from({length:Math.min(4,out.length)},worker));return out;
}
export function assertArrivedOrderTotals(items,records,bridgeBySku){
 const totals=new Map(),verified=new Map();
 for(const item of items){const sku=String(item?.product?.sku||item?.product?.id||'').trim().toUpperCase();if(!records.has(sku))continue;const qty=Number(item.qty);if(!Number.isSafeInteger(qty)||qty<1)throw Error('Invalid arrived-stock order quantity.');totals.set(sku,(totals.get(sku)||0)+qty);}
 for(const [sku,qty] of totals){const current=effectiveArrivedStock(sku,bridgeBySku.get(sku),records.get(sku));if(!Number.isSafeInteger(qty)||qty>current.qty)throw Object.assign(Error(`${sku}: only ${current.qty} selling units are currently available.`),{status:409});verified.set(sku,current);}
 return verified;
}
