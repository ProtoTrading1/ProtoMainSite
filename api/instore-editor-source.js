import {requireAuth} from './_auth.js';
import {loadLiveInstoreCatalogue,stockClient} from './extended-range.js';
import {runtimeWebsiteOnlyProvider,websiteOnlyRequestOrigin} from './_website-only-runtime.js';
import {inspectInstoreBarcode} from './_instore-barcode-inspection.js';
import {websiteMetadataRuntime} from './_instore-website-metadata-runtime.js';

// Server-to-server owner lookup used by Admin. It reads both existing Instore
// rows and the verified website-only provider without changing stock.
const owners=new Set(['danieljoffeinfo@gmail.com','george@proto.co.za','online@proto.co.za']);
export function createInstoreEditorSourceRoute({env=process.env,authenticate=requireAuth,getClient=stockClient,load=loadLiveInstoreCatalogue,provider=runtimeWebsiteOnlyProvider,inspect=inspectInstoreBarcode,metadata=websiteMetadataRuntime}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(env.PROTO_INSTORE_EDITOR_SOURCE_ENABLED!=='1')return res.status(503).json({error:'Source unavailable'});
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const sku=typeof req.query?.sku==='string'?req.query.sku.trim().toUpperCase():'';
  if(!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(sku))return res.status(400).json({error:'Invalid product code'});
  const barcode=req.query?.barcode===undefined?null:typeof req.query.barcode==='string'?req.query.barcode.trim().toUpperCase():'';
  if(barcode!==null&&!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(barcode))return res.status(400).json({error:'Invalid barcode'});
  try{
   const user=await authenticate(req,res);if(!user)return;
   if(!owners.has(String(user.email||'').trim().toLowerCase()))return res.status(403).json({error:'Owner account required'});
   if(barcode!==null)return res.status(200).json(await inspect({sku,barcode,client:getClient(),metadataProvider:metadata(env)}));
   const origin=websiteOnlyRequestOrigin(req,env);
   let sourceError=null;
   const {products}=await load(getClient(),{websiteOnlyProvider:async()=>{try{return await provider({origin});}catch(error){sourceError=error;throw error;}}});
   if(sourceError||!Array.isArray(products))throw Error('incomplete catalogue');
   const rows=products.filter(product=>String(product.sku||'').trim().toUpperCase()===sku)
    .map(product=>({sku,description:String(product.title||'').trim(),barcode:String(product.barcode||product.sku||'').trim().toUpperCase()}));
   if(rows.length>1||rows.some(row=>!row.description||!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(row.barcode)))throw Error('ambiguous product');
   return res.status(200).json({complete:true,rows});
  }catch{return res.status(503).json({error:'Product source could not be verified'});}
 };
}
export default createInstoreEditorSourceRoute();

