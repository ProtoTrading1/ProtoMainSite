import {createClient} from '@supabase/supabase-js';
import {stockFetch} from '../lib/stock-supabase.mjs';

export function createWebsiteMetadataProvider(client){
  return async skus=>{
    if(!Array.isArray(skus)||skus.length>10000) throw Error('Invalid website metadata request');
    const clean=[...new Set(skus.map(sku=>String(sku||'').trim().toUpperCase()))];
    if(clean.some(sku=>!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(sku))) throw Error('Invalid website metadata request');
    if(!clean.length)return {complete:true,overlays:[]};
    const {data,error}=await client.rpc('website_instore_metadata_read_v1',{p_skus:clean});
    if(error||data?.complete!==true||!Array.isArray(data?.overlays))throw Error('Website metadata unavailable');
    const requested=new Set(clean);
    if(data.overlays.some(row=>!requested.has(row?.sku)))throw Error('Invalid website metadata response');
    return data;
  };
}

// No runtime traffic unless explicitly enabled and pinned to the website's
// own project. Never read or write the Positill SQL database here.
export function websiteMetadataRuntime(env=process.env){
  if(env.PROTO_INSTORE_WEBSITE_METADATA_ENABLED!=='1')return null;
  const url=String(env.PROTO_INSTORE_METADATA_STORAGE_URL||'').trim(),expected=String(env.PROTO_INSTORE_METADATA_EXPECTED_URL||'').trim();
  const key=String(env.PROTO_INSTORE_METADATA_STORAGE_KEY||'').trim();
  if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(expected)||url!==expected||!key
   ||env.VERCEL_ENV!=='production'&&url===env.VITE_SUPABASE_URL
   ||env.VERCEL_ENV==='production'&&url!==env.VITE_SUPABASE_URL)throw Error('Website metadata configuration unavailable');
  if(!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)){
   let claims;try{const parts=key.split('.');if(parts.length!==3)throw Error();claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));}catch{throw Error('Website metadata key unavailable');}
   if(claims?.role!=='service_role'||`https://${claims.ref}.supabase.co`!==url)throw Error('Website metadata key unavailable');
  }
  return createWebsiteMetadataProvider(createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false},global:{fetch:stockFetch(key)}}));
}

