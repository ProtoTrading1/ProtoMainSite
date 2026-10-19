import {createStockClient,resolveStockCredentials} from './stock-supabase.mjs';
const HOST='https://yiqsvwajozafvalwcero.supabase.co';
const PROJECT='prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu';
// Fixed source-isolated verifier only. Exact source/branch identity is independently verified from deployment metadata.
const TABLES=Object.freeze(['website_stock','extended_range_items','instore_image_controls','instore_listing_controls']);
export function guardedTransport(transport,key) {
 let count=0;const seen=new Set();
 return {count:()=>count,fetch:async(input,init={})=>{
  const url=new URL(String(input));const method=String(init.method||'GET').toUpperCase();const table=url.pathname.slice('/rest/v1/'.length);
  const params=[...url.searchParams.keys()];const headers=new Headers(init.headers);
  if(method!=='GET'||url.origin!==HOST||url.username||url.password||url.hash||!TABLES.includes(table)||url.pathname!=='/rest/v1/'+table||params.length!==2||url.searchParams.getAll('select').length!==1||url.searchParams.getAll('limit').length!==1||url.searchParams.get('select')!=='sku'||url.searchParams.get('limit')!=='1'||count>=4||seen.has(table)||headers.get('apikey')!==key||headers.has('authorization'))throw Error('REQUEST_BLOCKED');
  count++;seen.add(table);const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try {
   const response=await transport(url.href,{...init,method:'GET',headers,redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});
   if(response.redirected||(response.url&&new URL(response.url).origin!==HOST)||!response.body)throw Error('RESPONSE_BLOCKED');
   const reader=response.body.getReader();const chunks=[];let bytes=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536)throw Error('RESPONSE_LIMIT');chunks.push(Buffer.from(value));}}
   finally{await reader.cancel().catch(()=>{});}
   return new Response(Buffer.concat(chunks),{status:response.status,headers:{'content-type':'application/json'}});
  }finally{clearTimeout(timer);controller.abort();}
 }};
}

export function scopeFailure(req,env){
 if(env.VERCEL!=='1'||env.VERCEL_ENV!=='production'||env.VERCEL_TARGET_ENV&&env.VERCEL_TARGET_ENV!=='production')return 'environment';
 if(env.VERCEL_PROJECT_ID!==PROJECT)return 'project';
 const host=req.headers?.host;
 if(typeof host!=='string')return 'host';
 if(typeof env.VERCEL_URL!=='string'||!/^protoportal-main-[a-z0-9]+-proto-team\.vercel\.app$/.test(env.VERCEL_URL)||host!==env.VERCEL_URL)return 'host';
 if(typeof env.STOCK_SUPABASE_KEY!=='string'||!/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(env.STOCK_SUPABASE_KEY))return 'binding';
 try{if(resolveStockCredentials(env).url!==HOST)return 'binding';}catch{return 'binding';}
 return null;
}
export function productionBindingHandler({env=process.env,clientFactory=createStockClient,transport=globalThis.fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(req.method!=='GET')return res.status(405).json({passed:false,error:'method',requests:0});
  const failure=scopeFailure(req,env);if(failure)return res.status(404).json({passed:false,error:failure,requests:0});
  const guard=guardedTransport(transport,env.STOCK_SUPABASE_KEY);const checks=[];
  try{
   const client=clientFactory({env,fetchImpl:guard.fetch});
   for(const table of TABLES){
    const result=await client.from(table).select('sku').limit(1).retry(false);
    const rows=result.data;const passed=!result.error&&Array.isArray(rows)&&rows.length<=1&&rows.every(row=>row&&typeof row.sku==='string'&&row.sku.trim().length>0)&&(table!=='website_stock'||rows.length===1);
    checks.push(passed);
    if(!passed)return res.status(502).json({passed:false,error:result.status===401?'credential':result.status===403?'permission':'provider',requests:guard.count()});
   }
   return res.status(200).json({passed:true,checks,requests:guard.count()});
  }catch{return res.status(502).json({passed:false,error:'provider',requests:guard.count()});}
 };
}
export function renderResult(result){
 const labels={environment:'Production build required',project:'Exact hosting project required',host:'Unique protected deployment host required',binding:'Valid pinned modern binding required',credential:'Provider rejected credential',permission:'Provider denied read access',provider:'Provider read did not pass',method:'GET required'};
 const message=result.passed===true?'All four read checks passed':Object.hasOwn(labels,result.error)?labels[result.error]:'Checks did not pass';
 const count=Number.isInteger(result.requests)&&result.requests>=0&&result.requests<=4?result.requests:0;
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Protected non-live stock binding check</title><main><h1>${message}</h1><p>Provider GET attempts: ${count}</p><p>No stock, customer, order or cache records were written.</p></main></html>`;
}
