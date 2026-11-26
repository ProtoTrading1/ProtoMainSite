// Isolated local preview: published public photos, synthetic basket, no provider writes.
import {createRoot} from 'react-dom/client';
import {useEffect,useState} from 'react';
import ProductCard from '../../src/components/ProductCard.jsx';
import {addBasketLine} from '../../lib/basket-lines.mjs';
import products from './reviewed-frames.json';
import '../../src/index.css';
if(location.hostname!=='127.0.0.1')throw Error('Local fixture only');
// No API/auth/analytics requests leave this preview. Public images load normally.
window.fetch=async()=>new Response('{}',{status:503,headers:{'content-type':'application/json'}});
export default function Preview(){
 const [basket,setBasket]=useState([]);
 function add(product,qty,_position,preference){setBasket(old=>addBasketLine(old,{product,qty,preference},{quantityCapForProduct:p=>p.stockOnHand}).items);return true;}
 useEffect(()=>{window.frameFixture={products,basket};},[basket]);
 return <main style={{maxWidth:1000,margin:'auto',padding:16}}><h1>Reviewed frame colour preview</h1><p>1066 Gold/Grey · 2306 Cream/Grey/Light Brown. One shared stock balance per frame.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,280px),1fr))',gap:20}}>{products.map(product=><ProductCard key={product.sku} product={product} addToCart={add}/>)}</div><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(basket.map(p=>({sku:p.product.sku,preference:p.preference,qty:p.qty,image:p.product.image,images:p.product.images.length,price:p.product.price,units:p.product.unitsOfIssue,stock:p.product.stockOnHand})),null,2)}</pre></main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
