import {readCompleteRows} from './_complete-rows.js';
import manifest from './_website-only-manifest.json' with {type:'json'};
const normalize=value=>String(value??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const code=/^[A-Z0-9][A-Z0-9._/-]{0,63}$/;

// Inspection includes hidden/inactive rows, main catalogue identifiers,
// website-only identities and saved website overrides. A failed or partial
// source must never be treated as evidence that a barcode is free.
export async function inspectInstoreBarcode({sku,barcode,client,metadataProvider,readRows=readCompleteRows,websiteManifest=manifest}){
 if(!code.test(sku||'')||!code.test(barcode||'')||!client||typeof metadataProvider!=='function'||!Array.isArray(websiteManifest?.items))throw Error('barcode inspection unavailable');
 const [instore,main,variants]=await Promise.all([
  readRows(()=>client.from('extended_range_items').select('sku,barcode',{count:'exact'})),
  readRows(()=>client.from('website_stock').select('sku,barcode',{count:'exact'})),
  readRows(()=>client.from('website_products').select('website_sku,product_sku,barcode',{count:'exact'}),{orderColumn:'website_sku'}),
 ]);
 if(!Array.isArray(instore)||!Array.isArray(main)||!Array.isArray(variants))throw Error('barcode inspection incomplete');
 const extras=websiteManifest.items.map(item=>({sku:item?.sku,barcode:item?.sku}));
 const all=[...instore,...extras];
 if(all.some(row=>typeof row?.sku!=='string'||!code.test(row.sku.trim().toUpperCase())||row.barcode!=null&&typeof row.barcode!=='string')
  ||main.some(row=>typeof row?.sku!=='string'||!normalize(row.sku)||row.barcode!=null&&typeof row.barcode!=='string'))throw Error('barcode source invalid');
 const codes=[...new Set(all.map(row=>row.sku.trim().toUpperCase()))],overlays=await metadataProvider(codes);
 if(overlays?.complete!==true||!Array.isArray(overlays.overlays))throw Error('barcode metadata incomplete');
 const bySku=new Map();
 for(const item of overlays.overlays){
  if(!codes.includes(item?.sku)||bySku.has(item.sku)||!code.test(item.barcode||''))throw Error('barcode metadata invalid');
  bySku.set(item.sku,item.barcode);
 }
 const wanted=normalize(barcode),matches=[];
 for(const row of main){if([row.sku,row.barcode].some(id=>normalize(id)===wanted))matches.push({sku:row.sku.trim().toUpperCase(),source:'main'});}
 for(const row of variants){
  if(typeof row?.website_sku!=='string'||typeof row?.product_sku!=='string'||row.barcode!=null&&typeof row.barcode!=='string')throw Error('barcode variants invalid');
  if([row.website_sku,row.product_sku,row.barcode].some(id=>normalize(id)===wanted))matches.push({sku:row.website_sku.trim().toUpperCase(),source:'main'});
 }
 for(const row of all){
  const current=row.sku.trim().toUpperCase(),override=bySku.get(current);
  if(current!==sku&&[current,override??row.barcode].some(id=>normalize(id)===wanted))matches.push({sku:current,source:'instore'});
 }
 return {complete:true,matches};
}

