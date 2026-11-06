// NEVER MERGE: a synthetic, read-only hosted proof for one isolated branch.
// Calls the actual candidate computation paths with injected Test-only ports.
import {loadLiveInstoreCatalogue} from './extended-range.js';
import {readFreshInstoreStock} from './stock.js';
import {resolveInstorePrices} from './send-order.js';

const sku='TEST-SAR-001';
const row=Object.freeze({sku,barcode:sku,title:'TEST DRUM',original_description:'TEST DRUM',price:11.5,available_stock:19,
 category:'Test',image_url:'https://example.test/test.jpg',image_source:'nutstore',image_review_status:'verified',visibility_status:'search_only',is_active:true});
const bridge=Object.freeze({CODE:sku,DESCR:'TEST DRUM',UNITS:'EACH',PRICE_A:10,ONHAND:20,BOOKED:1});

function syntheticClient(){
 const tables={extended_range_items:[],website_stock:[],instore_image_controls:[],instore_listing_controls:[]};
 return {from(name){
  if(!(name in tables))throw Error('Unexpected Test source');
  const filters=[];const q={select(){return q},eq(k,v){filters.push(x=>x[k]===v);return q},in(k,v){filters.push(x=>v.includes(x[k]));return q},
   or(){return q},gt(){return q},like(){return q},order(){return q},
   range(a,b){const rows=tables[name].filter(x=>filters.every(f=>f(x)));return Promise.resolve({data:rows.slice(a,b+1),count:rows.length,error:null})},
   limit(n){return Promise.resolve({data:tables[name].filter(x=>filters.every(f=>f(x))).slice(0,n),error:null})},
   then(resolve,reject){return Promise.resolve({data:tables[name].filter(x=>filters.every(f=>f(x))),error:null}).then(resolve,reject)}};return q;
 }};
}
export async function runSyntheticStorefrontProof(){
 const client=syntheticClient(),metadataProvider=async()=>({complete:true,overlays:[{sku,description:'Synthetic hosted description',barcode:sku}]});
 const fetchBridge=async()=>({ok:true,json:async()=>({row:bridge})});
 const bridgeEnv={STOCK_SQL_BRIDGE_URL:'https://synthetic.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic'};
 const browse=await loadLiveInstoreCatalogue(client,{websiteOnlyRows:[row],metadataProvider});
 const stock=await readFreshInstoreStock(sku,{websiteOnlyRows:[row],metadataProvider,indexClient:client,fetchBridge,bridgeEnv});
 const [order]=await resolveInstorePrices([{qty:1,product:{sku,isExtendedRange:true}}],{websiteOnlyRows:[row],metadataProvider,index:client,fetchBridge,bridgeEnv});
 const product=browse.products?.find(p=>p.sku===sku);
 if(!product||product.title!=='Synthetic hosted description'||stock?.qty!==19||order?.product?.sku!==sku
  ||order.product.name!=='Synthetic hosted description'||order.product.price!==11.5||order.product.code!==sku)throw Error('Synthetic proof failed');
 return {confirmed:true,sku,description:product.title,stock:stock.qty,orderDescription:order.product.name,orderPrice:order.product.price,barcode:order.product.code};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const host=String(req.headers.host||'');
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_PROJECT_ID!=='prj_tKIHSgHSenXJuEf8DdpKUYPVZhnu'
  ||process.env.VERCEL_GIT_COMMIT_REF!=='codex/isolated-storefront-workflow-20261106'
  ||!/^protoportal-main-[a-z0-9-]+-proto-team\.vercel\.app$/.test(host)
  ||req.method!=='GET'||req.url!=='/api/isolated-storefront-workflow-proof')return res.status(404).json({error:'Test unavailable'});
 try{return res.status(200).json(await runSyntheticStorefrontProof());}
 catch{return res.status(503).json({error:'Synthetic storefront paths could not be confirmed'});}
}

