import {useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
import ProductCard from '../../src/components/ProductCard.jsx';import {rememberAuthSession} from '../../src/lib/authHeaders.js';import '../../src/index.css';
if(location.hostname!=='127.0.0.1')throw Error('Isolated local preview only');
rememberAuthSession({access_token:'synthetic-secondary-preview-only',user:{id:'10000000-0000-4000-8000-000000000001'}});
export function App(){const [products,setProducts]=useState([]),[items,setItems]=useState([]),[status,setStatus]=useState('Loading');
 async function load(photos){const body=await(await fetch('/__fixture/secondary/catalogue?photos='+photos)).json();const entries=body.assets.flatMap(asset=>[[asset.main,asset.localMain],[asset.secondary,'/e2e/fixtures/secondary-photos-assets/secondary-placeholder.png']]);
  await new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=()=>resolve();navigator.serviceWorker.controller.postMessage({type:'secondary-mappings',entries},[channel.port2]);});setProducts(body.products);setStatus(photos==='yes'?'Secondary preview attached':'Main photos only');}
 useEffect(()=>{void load('no');},[]);
 return <main style={{maxWidth:1100,margin:'auto',padding:16}}><h1>Instore secondary photos - preview only</h1><p>Public main photos are retained. The extra image is a clearly marked placeholder; actual Archive originals remain private. Demo stock and baskets are local. No order is sent.</p><div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button onClick={()=>load('yes')}>Show secondary photos</button><button onClick={()=>load('no')}>Return to main photos</button></div><p role="status" data-testid="fixture-status">{status}</p><div className="product-grid">{products.map(product=><ProductCard key={product.sku} product={product} addToCart={(product,qty)=>setItems(current=>[...current,{product,qty}])}/>)}</div><output data-testid="preview-basket">{JSON.stringify(items)}</output></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
