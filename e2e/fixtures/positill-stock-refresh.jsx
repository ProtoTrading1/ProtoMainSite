// Actual ProductCard, historical public product/photo, simulated read-only source.
import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import {refreshCatalogueStock} from '../../api/_catalogue-stock.js';
import {SHOWROOM_STOCK_REPORT,validateShowroomStockBatch} from '../../lib/showroom-batch-stock.mjs';
import ProductCard from '../../src/components/ProductCard.jsx';
import {rememberAuthSession} from '../../src/lib/authHeaders.js';
import '../../src/index.css';
if(location.hostname!=='127.0.0.1')throw Error('Local preview only');
const image='https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/8640000255/1.jpg';
const product={id:'8640000255',sku:'8640000255',code:'8640000255',barcode:'8640000255',name:'CHRISTMAS BALLOONS | ±12PCS',price:27.5,stockQty:96,stockOnHand:96,unitsOfIssue:'PACK 12',image,images:[image],minQty:1,availability:{state:'in_stock',label:'In stock',canOrder:true}};
let mode='68',reads=0;
rememberAuthSession({access_token:'synthetic-stock-refresh-noncredential',user:{id:'synthetic-stock-refresh'}});
window.fetch=async(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin||url.pathname!=='/api/stock'||url.searchParams.get('sku')!==product.sku||init?.method&&init.method!=='GET')return Response.json({error:'Isolated preview blocks this request'},{status:503});reads++;window.__stockPreviewReads=reads;return mode==='failure'?Response.json({sku:product.sku,source_code:product.sku,qty:null,stock_source:'unavailable',error:'Live stock unavailable'},{status:503}):Response.json({sku:product.sku,source_code:product.sku,qty:Number(mode),available_stock:Number(mode),stock_source:'positill_live',checked_at:new Date().toISOString(),sourceUnits:'PACK 12',sourceUnitsRaw:'PKT,12',availability:{state:'in_stock',label:'In stock',canOrder:true}});};
const catalogue=[product,{...product,id:'PREVIEW-RESTOCK',sku:'PREVIEW-RESTOCK',barcode:'PREVIEW-RESTOCK',code:'PREVIEW-RESTOCK',name:'Restocked preview item',stockQty:0,stockOnHand:0,inStock:false,availability:{state:'out_of_stock',canOrder:false}}];
function CatalogueDiscovery({selected}){
 const [rows,setRows]=useState([]),[availableOnly,setAvailableOnly]=useState(true);
 useEffect(()=>{let current=true;
  const readStock=async codes=>{
   if(selected==='failure')return new Map(codes.map(code=>[code,null]));
   const report={ok:true,schemaVersion:'proto.sql-report.v1',report:{id:SHOWROOM_STOCK_REPORT},params:{skus:codes},rows:codes.map(code=>({CODE:code,ONHAND:code===product.sku?Number(selected):5,BOOKED:0,UNITS:'PKT,12'})),rowCount:codes.length,meta:{source:'POSWINSQL',readOnly:true,backendCompatible:true,requestedCount:codes.length,rowCapReached:false,missingCodes:[],generatedAt:new Date().toISOString()}};
   return validateShowroomStockBatch(report,codes);
  };
  void refreshCatalogueStock(catalogue,{readStock}).then(result=>{if(current)setRows(result);});
  return()=>{current=false;};
 },[selected]);
 const visible=rows.filter(row=>!availableOnly||row.inStock);
 return <section aria-label="Catalogue discovery simulation" style={{marginTop:24,border:'1px solid #888',padding:16}}><h2>Available-only discovery</h2><p>SIMULATION: actual catalogue stock adapter and report validator. The second listing was cached at0 and is now5. No source or website writes.</p><label><input type="checkbox" checked={availableOnly} onChange={event=>setAvailableOnly(event.target.checked)}/>Available only</label><p data-testid="discovery-count">Visible listings: {visible.length}</p><p data-testid="discovery-proof">Unknown balances: {rows.filter(row=>row.stockOnHand===null).length}; zero balances: {rows.filter(row=>row.stockOnHand===0).length}</p><ul>{visible.map(row=><li key={row.sku} data-testid={`discovery-${row.sku}`}>{row.name}: {row.stockOnHand===null?'Stock unavailable':row.stockOnHand} packets</li>)}</ul></section>;
}
export default function Preview(){const [selected,setSelected]=useState('68'),[adds,setAdds]=useState(0);return <main style={{maxWidth:850,margin:'auto',padding:20}}><h1>Automatic stock refresh preview</h1><p>LOCAL SIMULATION ONLY. Actual historical product identity, price and public main photo; source replies are simulated. No live stock, basket, order or database writes.</p><p>Historical cached quantity:96. Check fresh68, then change the simulated source to63 and check again. The public photo and R27.50 per packet of12 stay unchanged.</p><label>Simulated source <select aria-label="Simulated source" value={selected} onChange={event=>{mode=event.target.value;setSelected(mode);}}><option value="68">68 available</option><option value="63">63 available</option><option value="failure">Bridge unavailable</option></select></label><p role="status">Memory-only Add callbacks: {adds}</p><div style={{maxWidth:420}}><ProductCard product={product} addToCart={()=>{setAdds(n=>n+1);return true;}}/></div><CatalogueDiscovery selected={selected}/></main>;}
createRoot(document.getElementById('root')).render(<Preview/>);
