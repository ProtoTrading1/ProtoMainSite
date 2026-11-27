// Local visual review of the actual ProductCard and basket helpers. Snapshot
// values were checked read-only; this fixture never signs in or sends an order.
import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import ProductCard from '../../src/components/ProductCard.jsx';
import {addBasketLine} from '../../lib/basket-lines.mjs';
import {instoreQuantityLimit} from '../../lib/sarongi-instore-requests.mjs';
import product from './party-plates.json';
import '../../src/index.css';
if(location.hostname!=='127.0.0.1')throw Error('Local fixture only');
window.fetch=async()=>new Response('{}',{status:503,headers:{'content-type':'application/json'}});
export default function Preview(){
 const [basket,setBasket]=useState([]);
 function add(selected,qty,_point,preference){setBasket(old=>addBasketLine(old,{product:{...selected,isExtendedRange:true},qty,preference},{quantityCapForProduct:instoreQuantityLimit}).items);return true;}
 return <main style={{maxWidth:980,margin:'auto',padding:20}}><h1>Party plate colour preview</h1><p>Pack of 10 · R11.50 · shared stock snapshot: 1,243 packs.</p><p>Choose a colour below. Colour is a preference, subject to availability when packing. The collage remains the saved main.</p><div style={{maxWidth:440}}><ProductCard product={product} addToCart={add}/></div><section aria-label="Preview basket"><h2>Preview basket</h2>{basket.length===0?<p>No colours added yet.</p>:basket.map(line=><article key={line.preference} style={{display:'flex',alignItems:'center',gap:12,padding:12}}><img src={line.product.image} alt={line.preference} width="72" height="72"/><div><strong>{line.preference}</strong><p>{line.qty} packs · SKU {line.product.sku} · R{line.product.price.toFixed(2)} per pack of 10</p></div></article>)}</section><p>This is an isolated preview. It cannot change live baskets, stock or orders.</p></main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
