// NEVER MERGE. This isolated entry point renders approved photos only in Test.
/* eslint-disable react-refresh/only-export-components */
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ProductCard from './components/ProductCard.jsx';
import {getSession} from './lib/auth.js';

// This proof must not write analytics, carts, orders or live product data.
const originalFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.origin);
 const method=String(init.method||'GET').toUpperCase();
 if(url.origin===location.origin&&url.pathname==='/api/reusable-gallery-proof'&&method==='GET')return originalFetch(input,init);
 if(url.hostname.endsWith('.supabase.co')&&url.pathname.startsWith('/auth/v1/')&&['GET','POST'].includes(method))return originalFetch(input,init);
 return Promise.reject(Error('Synthetic proof network request blocked'));
};
function Proof(){
 const [run,setRun]=useState(''),[product,setProduct]=useState(null),[message,setMessage]=useState('Enter the approved-photo Test run ID.');
 async function show(event){event.preventDefault();setProduct(null);try{
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(run))throw Error();
  const session=await getSession();if(!session?.access_token){setMessage('Sign in on the storefront Test page first.');return;}
  const response=await fetch('/api/reusable-gallery-proof?runId='+encodeURIComponent(run),{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store',redirect:'error'});
  const gallery=await response.json();if(!response.ok||gallery.status!=='actual_gallery'||gallery.photos?.length!==17)throw Error();
  const images=gallery.photos.map(p=>p.url);setProduct({id:'TEST-SERVIETTES',sku:'TEST-SERVIETTES',code:'TEST-SERVIETTES',name:'Serviettes — Test gallery',image:images[0],images,price:0,stock:0,minQty:1});
  setMessage('Approved serviette photos loaded in Test. No orders or stock changes are enabled.');
 }catch{setMessage('The Test gallery could not be confirmed.');}}
 return <main><h1>Serviette gallery Test</h1><p>{message}</p><form onSubmit={show}><label>Test run ID <input value={run} onChange={e=>setRun(e.target.value)}/></label><button>Show Test gallery</button></form>{product&&<ProductCard product={product} addToCart={()=>{}} initialZoomOpen/>}</main>;
}
createRoot(document.getElementById('root')).render(<Proof/>);
