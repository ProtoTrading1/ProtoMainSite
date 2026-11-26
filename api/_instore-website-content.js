import { validateInstoreWebsiteContent } from '../lib/instore-website-content.mjs';
import {createHash} from 'node:crypto';
// Match jsonb_build_array(... )::text in the website-only SQL identity helper.
export function instoreContentSourceIdentity(row){
 const values=['sku','barcode','supplier_name','image_source_key'].map(key=>row?.[key]==null?null:String(row[key]));
 return createHash('sha256').update('['+values.map(value=>JSON.stringify(value)).join(', ')+']').digest('hex');
}
export async function readInstoreWebsiteContent(client,skus=null) {
 try{
  const {data,error}=await client.rpc('instore_website_content_read_v1',{p_skus:skus});
  if(error)throw error;return validateInstoreWebsiteContent(data);
 }catch{
  // Source wording remains usable if the optional website metadata store is
  // unavailable; this cannot authorize a stock/identity fallback or a Save.
  console.error('Instore website text unavailable; serving source wording');
  return {generation:'unavailable',overrides:[]};
 }
}
