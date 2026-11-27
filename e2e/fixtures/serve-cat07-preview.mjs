import {createServer} from 'vite';
import process from 'node:process';
import {fixtureProduct,fixtureReceipt,fixtureImages} from './cat07-server-data.mjs';
import {resolveCat07OrderPreview} from '../../lib/cat07-order-preview.mjs';
import {buildOrderEmailHtml} from '../../api/send-order.js';
const port=5274;
process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${port}/mock-supabase`;
process.env.VITE_SUPABASE_ANON_KEY='cat07-preview-public-placeholder';
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false,forwardConsole:false},plugins:[{name:'cat07-isolated-preview',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,'http://127.0.0.1:'+port);
 if(req.headers.host!==`127.0.0.1:${port}`){res.statusCode=403;return res.end();}
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/mock-supabase')){res.statusCode=409;return res.end('Isolated preview only');}
 if(!url.pathname.startsWith('/__fixture/cat07/'))return next();
 res.setHeader('Cache-Control','no-store');
 if(req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`){res.statusCode=403;return res.end();}
 if(url.pathname==='/__fixture/cat07/product'&&['GET','HEAD'].includes(req.method)){res.setHeader('Content-Type','application/json');return res.end(req.method==='HEAD'?undefined:JSON.stringify(fixtureProduct));}
 if(url.pathname.startsWith('/__fixture/cat07/image/')&&['GET','HEAD'].includes(req.method)){const bytes=fixtureImages.get(url.pathname.split('/').pop());res.setHeader('Content-Type','image/png');res.statusCode=bytes?200:404;return res.end(req.method==='HEAD'?undefined:bytes);}
 if(url.pathname!=='/__fixture/cat07/order-preview'||req.method!=='POST'){res.statusCode=404;return res.end();}
 if(req.headers.origin!==`http://127.0.0.1:${port}`){res.statusCode=403;return res.end();}
 try{let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)throw Error('Preview request too large');}const items=JSON.parse(body).items;
 const quote=resolveCat07OrderPreview(items,{receipt:fixtureReceipt,indexRow:{sku:fixtureProduct.sku,barcode:fixtureProduct.barcode,destination:'instore',image:fixtureProduct.image,hidden:false},source:{authority:'live-exact-code-observation',canonicalCode:fixtureProduct.sku,units:'EACH',priceInclVat:6,onHand:6,booked:0,available:6,observedAt:new Date().toISOString()}});
 const html=buildOrderEmailHtml({customer:{business:'LOCAL PREVIEW — NOT AN ORDER'},items:quote.items,totals:{subtotal:quote.total,total:quote.total}});res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...quote,html}));
 }catch(error){res.statusCode=409;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}
 });}}]});await server.listen();console.log(`CAT07 isolated preview http://127.0.0.1:${port}/e2e/fixtures/cat07.html`);
