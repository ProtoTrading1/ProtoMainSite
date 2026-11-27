import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
import {createStockHandler} from '../../api/stock.js';
import {resolveAuthoritativePrices} from '../../api/send-order.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),port=5395,origin=`http://127.0.0.1:${port}`,sku='8731700001';let hidden=false;
const row={sku,barcode:'',title:'TUMBLER CAN W/BAMBOO LID STRAW 500ml',price:35,available_stock:11,minimum_stock:1,image_source:'nutstore',image_source_key:'sha256:'+'a'.repeat(64),image_url:'https://images.example.test/tumbler.jpg',image_review_status:'verified',visibility_status:'search_only',is_active:true};
const db={from(table){const q={select(){return q;},eq(){return q;},in(){return q;},or(){return q;},limit(){return q;},then(resolve){return Promise.resolve({data:table==='extended_range_items'?[row]:table==='instore_listing_controls'&&hidden?[{sku,status:'hidden'}]:[],error:null}).then(resolve);}};return q;},rpc:async()=>({data:[],error:null})};
const bridgeEnv={STOCK_SQL_BRIDGE_URL:'https://synthetic.invalid',STOCK_SQL_BRIDGE_KEY:'synthetic-only'},fetchBridge=async()=>Response.json({row:{CODE:sku,DESCR:row.title,UNITS:'EACH',PRICE_A:30.43,ONHAND:11,BOOKED:0}});
const handler=createStockHandler({authenticate:async(req,res)=>{if(req.headers.authorization==='Bearer synthetic-hidden-stock-token')return {id:'synthetic-customer'};res.status(401).json({error:'Synthetic session required'});return null;},approve:async()=>true,getClient:()=>db,websiteOnlyProvider:async()=>({rows:[]}),fetchBridge,bridgeEnv});
const server=await createServer({root,envFile:false,configFile:false,define:{'import.meta.env.VITE_SUPABASE_URL':JSON.stringify(origin+'/mock-supabase'),'import.meta.env.VITE_SUPABASE_ANON_KEY':JSON.stringify('synthetic-placeholder-only')},plugins:[react(),{name:'isolated-hidden-stock',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 const url=new URL(req.url,origin);if(!url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/__fixture/'))return next();
 if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==origin){res.statusCode=403;return res.end();}
 res.status=function(code){this.statusCode=code;return this;};res.json=function(value){this.setHeader('Content-Type','application/json');this.end(JSON.stringify(value));return this;};
 if(url.pathname==='/api/stock'&&req.method==='GET'){req.query=Object.fromEntries(url.searchParams);return handler(req,res);}
 if(req.method==='POST'&&req.headers.origin===origin&&url.pathname==='/__fixture/hidden-stock/reset'){hidden=false;return res.status(200).json({hidden});}
 if(req.method==='POST'&&req.headers.origin===origin&&url.pathname==='/__fixture/hidden-stock/hide'){hidden=true;return res.status(200).json({hidden});}
 if(req.method==='POST'&&req.headers.origin===origin&&url.pathname==='/__fixture/hidden-stock/order'){
  try{await resolveAuthoritativePrices([{qty:1,product:{id:sku,sku,isExtendedRange:false,price:35,unitsOfIssue:'EACH'}}],{index:db,classify:async()=>new Set([sku]),fetchBridge,bridgeEnv});return res.status(200).json({accepted:true});}catch(error){return res.status(error.status||409).json({error:error.message});}
 }
 return res.status(403).json({error:'Synthetic preview API denied'});
 });}}],server:{host:'127.0.0.1',port,strictPort:true}});
await server.listen();console.log(origin+'/e2e/fixtures/hidden-instore-stock.html');
