// NEVER MERGE. This proof reads one synthetic record through the protected
// Admin Test endpoint. It cannot select a host, SKU, or storage destination.
import {requireAuth} from './_auth.js';
import {loadLiveInstoreCatalogue} from './extended-range.js';
import {readFreshInstoreStock} from './stock.js';
import {resolveInstorePrices} from './send-order.js';

const sku='TEST-ONLY-001';
const adminUrl='https://protoportal-admin-6uy7t4b23-proto-team.vercel.app/api/isolated-storefront-proof';
const owners=new Set(['danieljoffeinfo@gmail.com','george@proto.co.za','online@proto.co.za']);
const row={sku,barcode:sku,title:'Synthetic bracelet',original_description:'Synthetic bracelet',price:11.5,available_stock:19,category:'Test',image_url:'https://example.test/test.jpg',image_source:'nutstore',image_review_status:'verified',visibility_status:'search_only',is_active:true};
const bridge={CODE:sku,DESCR:'Synthetic bracelet',UNITS:'EACH',PRICE_A:10,ONHAND:20,BOOKED:1};
function syntheticClient(){return {from(name){
 if(!['extended_range_items','website_stock','instore_image_controls','instore_listing_controls'].includes(name))throw Error('unexpected source');
 const q={select(){return q},eq(){return q},in(){return q},or(){return q},gt(){return q},like(){return q},order(){return q},range(){return Promise.resolve({data:[],count:0,error:null})},limit(){return Promise.resolve({data:[],error:null})},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return q;
}};}
export function createConnectedStorefrontProof({env=process.env,authenticate=requireAuth,transport=globalThis.fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(env.VERCEL_ENV!=='preview'||env.VERCEL_PROJECT_ID!=='prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu'||env.VERCEL_GIT_COMMIT_REF!=='codex/isolated-storefront-workflow-20261106'||req.method!=='GET'||req.url!=='/api/isolated-connected-storefront-proof'||!/^protoportal-main-[a-z0-9-]+-proto-team\.vercel\.app$/.test(String(req.headers.host||'')))return res.status(404).json({error:'Test unavailable'});
  if(String(req.headers.accept||'').includes('text/html')){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
   return res.status(200).send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connected Test</title></head><body><h1>Connected storefront Test</h1><p>Sign in using the storefront Test page first. This reads one synthetic product and places no order.</p><button id="check">Run connected Test</button><p id="status" role="status"></p><script>document.getElementById('check').onclick=async()=>{const status=document.getElementById('status');status.textContent='Checking…';try{const s=JSON.parse(localStorage.getItem('sb-kyodrsqnmihwoplkhwwf-auth-token')||'null');if(!s?.access_token)throw Error('Sign in on this preview first.');const r=await fetch(location.pathname,{headers:{Authorization:'Bearer '+s.access_token,Accept:'application/json'},cache:'no-store'});const data=await r.json();if(!r.ok||data.confirmed!==true)throw Error('Connected Test could not be confirmed.');status.textContent='Connected Test passed: '+data.description;}catch(e){status.textContent=e.message||'Connected Test could not be confirmed.';}};</script></body></html>`);
  }
  let phase='owner',upstreamStatus=null;
  try{
   const user=await authenticate(req,res);if(!user)return;
   if(!owners.has(String(user.email||'').trim().toLowerCase())||!/^Bearer [A-Za-z0-9._-]{20,8192}$/.test(req.headers.authorization||''))return res.status(403).json({error:'Owner account required'});
   phase='admin-read';const response=await transport(adminUrl,{method:'GET',headers:{authorization:req.headers.authorization},redirect:'manual',cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(30000)});upstreamStatus=response.status??null;
   if(!response.ok)throw Error('Test source unavailable');
   const raw=await response.text();if(raw.length>8192)throw Error('Test response too large');
   phase='test-record';const product=JSON.parse(raw)?.product;
   if(product?.sku!==sku||product?.barcode!==sku||typeof product.title!=='string'||!product.title.trim()||product.title.length>200)throw Error('Test product mismatch');
   const metadataProvider=async()=>({complete:true,overlays:[{sku,description:product.title,barcode:sku}]});
   const client=syntheticClient(),fetchBridge=async()=>({ok:true,json:async()=>({row:bridge})}),bridgeEnv={STOCK_SQL_BRIDGE_URL:'https://synthetic.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic'};
   phase='storefront';const browse=await loadLiveInstoreCatalogue(client,{websiteOnlyRows:[row],metadataProvider});
   const stock=await readFreshInstoreStock(sku,{websiteOnlyRows:[row],metadataProvider,indexClient:client,fetchBridge,bridgeEnv});
   const [order]=await resolveInstorePrices([{qty:1,product:{sku,isExtendedRange:true}}],{websiteOnlyRows:[row],metadataProvider,index:client,fetchBridge,bridgeEnv});
   if(browse.products?.[0]?.title!==product.title||stock?.qty!==19||order?.product?.name!==product.title||order?.product?.price!==11.5||order?.product?.code!==sku)throw Error('Test path mismatch');
   return res.status(200).json({confirmed:true,sku,description:product.title,stock:stock.qty,orderDescription:order.product.name,barcode:sku});
  }catch{console.warn('connected_test_held',JSON.stringify({phase,upstreamStatus}));return res.status(503).json({error:'The connected Test could not be confirmed.',stage:phase,upstreamStatus});}
 };
}
export default createConnectedStorefrontProof();

