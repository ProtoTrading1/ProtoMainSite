import {createRoot} from 'react-dom/client';
import {useState} from 'react';
import ProductCard from '../../src/components/ProductCard.jsx';
import {rememberAuthSession} from '../../src/lib/authHeaders.js';
import '../../src/index.css';
if(location.hostname!=='127.0.0.1')throw Error('Local synthetic fixture only');
const localFetch=globalThis.fetch.bind(globalThis);
rememberAuthSession({access_token:'synthetic-hidden-stock-token',user:{id:'synthetic-hidden-stock-customer'}});
globalThis.fetch=(input,options)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin===location.origin&&(url.pathname==='/api/stock'||url.pathname.startsWith('/__fixture/hidden-stock/')))return localFetch(input,options);return Promise.resolve(Response.json({error:'Synthetic preview blocks external requests'},{status:403}));};
const canvas=document.createElement('canvas');canvas.width=450;canvas.height=450;const x=canvas.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,450,450);x.fillStyle='#d4e3ea';x.fillRect(145,90,160,235);x.fillStyle='#c9ad7c';x.fillRect(135,70,180,25);x.fillStyle='#333';x.font='20px sans-serif';x.fillText('SYNTHETIC TEST IMAGE',100,385);const image=canvas.toDataURL();
const product={id:'8731700001',sku:'8731700001',code:'8731700001',barcode:'',name:'TUMBLER CAN W/BAMBOO LID STRAW 500ml',price:35,stockQty:11,stockOnHand:11,isExtendedRange:true,unitsOfIssue:'EACH',image,images:[image],availability:{state:'in_stock',label:'In stock',canOrder:true},category:'Instore Products'};
export default function Preview(){const [hidden,setHidden]=useState(false),[adds,setAdds]=useState(0),[message,setMessage]=useState('');
 async function hide(){const response=await localFetch('/__fixture/hidden-stock/hide',{method:'POST'});if(response.ok){setHidden(true);setMessage('Synthetic listing hidden. The mounted card can retain its previous verification until another check.');}}
 async function order(){const response=await localFetch('/__fixture/hidden-stock/order',{method:'POST'}),data=await response.json();setMessage(response.ok?'Synthetic resolver unexpectedly accepted':`Retained basket order held: ${data.error}`);}
 return <main style={{maxWidth:850,margin:'auto',padding:20}}><h1>Hidden Instore stock check</h1><p>PREVIEW ONLY · synthetic source, customer, listing and image. No website, source, basket or order writes.</p><p>A cached published card is intentionally kept mounted. Hide it, then open its detail to trigger the real fresh stock check.</p><button type="button" onClick={hide}>Hide synthetic listing</button><button type="button" onClick={order}>Check retained basket order</button><p>Listing: {hidden?'Hidden':'Visible'}. Synthetic Add callbacks: <span data-testid="adds">{adds}</span>. Retained basket: 1 item (unchanged).</p><p role="status">{message}</p><div style={{maxWidth:420}}><ProductCard product={product} addToCart={()=>{setAdds(v=>v+1);return true;}}/></div></main>;
}
// Each local preview mount starts from the same visible synthetic state.
const reset = await localFetch('/__fixture/hidden-stock/reset',{method:'POST'});
if(!reset.ok)throw Error('Synthetic preview reset failed');
createRoot(document.getElementById('root')).render(<Preview/>);
