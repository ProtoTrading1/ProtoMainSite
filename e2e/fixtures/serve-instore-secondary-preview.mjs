import {createServer} from 'vite';
import process from 'node:process';
import {attachInstoreSecondaryGalleries} from '../../lib/instore-secondary-galleries.mjs';
const port=5392,origin=`http://127.0.0.1:${port}`;
process.env.VITE_SUPABASE_URL=origin+'/mock-supabase';process.env.VITE_SUPABASE_ANON_KEY='secondary-photo-preview-placeholder';
const assets='https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/';
const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'];
const codes=['8622930082','8622930083'];
export const products=codes.map((sku,index)=>({id:sku,sku,code:sku,barcode:sku,name:`Match-card game Stage ${index+3}`,title:`Match-card game Stage ${index+3}`,description:'Local preview of ordinary secondary photos.',price:27.5,stockQty:index?39:35,stockOnHand:index?39:35,unitsOfIssue:'EACH',minQty:1,image:assets+`instore/${sku}/`+(index?'7d1883a7-0bda-4287-90bc-c9f989fc9a6b':'932c0a72-5359-4bd3-be93-9f0848cb58fa')+'.jpg',isExtendedRange:true,instoreSourceIdentity:(index?'d':'c').repeat(64),imageStatus:'visible',availability:{state:'in_stock',canOrder:true}})).map(product=>({...product,images:[product.image]}));
const extras=codes.map((_,index)=>assets+'instore-secondary-v1/'+ids[index]+'/'+(index?'b':'a').repeat(64)+'.png');
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false,forwardConsole:false},plugins:[{name:'secondary-photos-isolated',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,origin);if(req.headers.host!==`127.0.0.1:${port}`){res.statusCode=403;return res.end();}
 if(req.headers.origin&&req.headers.origin!==origin){res.statusCode=403;return res.end();}
 if(url.pathname==='/api/stock'&&req.method==='GET'){
  const product=products.find(value=>value.sku===url.searchParams.get('sku'));if(!product){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify({sku:product.sku,qty:product.stockQty,unitsOfIssue:'EACH',unitsOfIssueRaw:'EACH',unitsOfIssueVerified:true,unitsOfIssueSource:'positill_live',availability:{state:'in_stock',canOrder:true}}));
 }
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/mock-supabase')){res.statusCode=409;return res.end('Isolated preview; no external APIs or orders');}
 if(url.pathname!=='/__fixture/secondary/catalogue')return next();if(req.method!=='GET'){res.statusCode=405;return res.end();}
 const galleries=url.searchParams.get('photos')==='yes'?products.map((product,index)=>({sku:product.sku,sourceIdentitySHA:product.instoreSourceIdentity,mainUrl:product.image,baseImageUrls:[product.image],imageUrls:[product.image,extras[index]],managedImageUrls:[extras[index]],revision:1,operationId:ids[index]})):[];
 const rows=await attachInstoreSecondaryGalleries(products,{rpc(){return {abortSignal:async()=>({data:{protocol:'proto.instore-secondary-gallery.v1',generation:'1',galleries}})};}},{generation:'1'});
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({products:rows,assets:products.map((product,index)=>({main:product.image,secondary:extras[index],localMain:`/e2e/fixtures/secondary-photos-assets/${product.sku}-main.jpg`}))}));
 });}}]});await server.listen();console.log(origin+'/e2e/fixtures/instore-secondary-photos.html');
