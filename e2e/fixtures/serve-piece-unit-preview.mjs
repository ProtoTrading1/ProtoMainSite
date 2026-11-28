import {createServer} from 'vite';
import process from 'node:process';
import {adapt} from '../../api/products.js';
import {createStockHandler} from '../../api/stock.js';
import {validateShowroomStockObservation} from '../../lib/showroom-live-stock.mjs';
const port=Number(process.env.PIECE_PREVIEW_PORT||5408),origin=`http://127.0.0.1:${port}`,code='17BFTGC';
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid local preview port');
process.env.VITE_SUPABASE_URL=origin+'/mock-supabase';process.env.VITE_SUPABASE_ANON_KEY='local-preview-not-a-credential';
let units='5PC';
const rows=['BLK','YEL'].map(colour=>({sku:`${code}-${colour}`,barcode:code,title:`Five piece set ${colour}`,price:119,units_of_issue:'5PCS',min_order_qty:1,stock_qty:22,available_stock:22,image_url_one:`/__fixture/${colour}.svg`}));
const db={from(){const q={select(){return q;},eq(field,value){q.value=value;return q;},limit(){return Promise.resolve({data:rows.filter(row=>row.sku===q.value)});}};return q;},async rpc(){return {data:[]};}};
const stock=createStockHandler({authenticate:async()=>({id:'synthetic'}),approve:async()=>true,getClient:()=>db,readStock:async()=>new Map([[code,validateShowroomStockObservation(code,{CODE:code,ONHAND:22,BOOKED:0,UNITS:units,DESCR:'SYNTHETIC FIVE PIECE SET'})]])});
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,hmr:false},plugins:[{name:'piece-unit-isolation',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,origin);if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==origin){res.statusCode=403;return res.end();}
 if(req.method!=='GET'){res.statusCode=405;return res.end();}
 if(url.pathname==='/__fixture/identity'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({protocol:'proto.piece-unit-preview.v1'}));}
 if(url.pathname==='/__fixture/catalogue'){units=url.searchParams.get('mismatch')==='yes'?'50PC':'5PC';res.setHeader('content-type','application/json');return res.end(JSON.stringify(rows.map(row=>adapt(row,[]))));}
 if(/^\/__fixture\/(BLK|YEL)\.svg$/.test(url.pathname)){res.setHeader('content-type','image/svg+xml');return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${url.pathname.includes('BLK')?'#333':'#fedb32'}"/><text x="40" y="300" fill="white" font-size="28">Preview placeholder</text></svg>`);}
 if(url.pathname==='/api/stock'){req.query=Object.fromEntries(url.searchParams);res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(data));return res;};return stock(req,res);}
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/mock-supabase')){res.statusCode=403;return res.end('Isolated preview');}return next();
 });}}]});await server.listen();console.log(origin+'/e2e/fixtures/piece-unit-stock.html');
