// Synthetic stock responses and memory-only basket; no authenticated/live APIs.
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import ProductCard from '../../src/components/ProductCard.jsx';
import products from './legacy-low-stock.json';
import {rememberAuthSession} from '../../src/lib/authHeaders.js';
import '../../src/index.css';
if(location.hostname!=='127.0.0.1')throw Error('Local fixture only');
rememberAuthSession({access_token:'isolated-preview-noncredential',user:{id:'isolated-preview-owner'}});
window.fetch=async input=>{const url=new URL(typeof input==='string'?input:input.url,location.href);const product=products.find(p=>url.searchParams.get('sku')===p.sku);return new Response(JSON.stringify(url.pathname==='/api/stock'&&product?{sku:product.sku,qty:product.stockQty,unitsOfIssue:'EACH',unitsOfIssueRaw:'EACH',unitsOfIssueSource:'positill_live',unitsOfIssueVerified:true,availability:product.availability}:{}),{status:url.pathname==='/api/stock'&&product?200:503,headers:{'content-type':'application/json'}});};
export default function Preview(){const [count,setCount]=useState(0);return <main style={{maxWidth:980,margin:'auto',padding:20}}><h1>Existing Instore low-stock preview</h1><p>Fresh source snapshot: cartoon wipes1 EACH at R12.50; grey cooler9 EACH at R159. Existing selected photos retained.</p><p>Availability is confirmed when packing. This isolated preview uses synthetic responses and cannot change live baskets, stock or orders.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:20}}>{products.map(product=><ProductCard key={product.sku} product={product} addToCart={()=>{setCount(n=>n+1);return true;}}/>)}</div><p role="status">Preview additions: {count}</p></main>;}
createRoot(document.getElementById('root')).render(<Preview/>);
