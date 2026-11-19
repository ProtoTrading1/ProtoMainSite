// Local browser regression fixture only; excluded from the production entry.
import {createRoot} from 'react-dom/client';
import '../../src/index.css';
import ExtendedRangePage from '../../src/components/ExtendedRangePage.jsx';
import {rememberAuthSession} from '../../src/lib/authHeaders.js';
import {clearStoredInstoreResponses,instoreCatalogue,prefetchInstoreCatalogue,storedExtendedRange} from '../../src/lib/extendedRange.js';

if(location.hostname!=='127.0.0.1')throw Error('Local fixture only');
const images=[
 '/product-options/sarongi/KBRA3014/35f4550c31cf50d4f957d5c5621c4e136b23c4d0169bf82990a7d7b9ad605a30.jpg',
 '/product-options/sarongi/KBRA3014/a8dfc35d69ef859a98210a768cd8601fabd7221b68824d830be36cec5925fbd1.jpg',
 '/product-options/sarongi/KBRA3014/26dacf3e28db5d65dffcf59052e4a194efd2b478299aa2441811c2ee561bac0e.jpg',
];
export const product={id:'SYNTHETIC-GALLERY',sku:'SYNTHETIC-GALLERY',name:'Synthetic gallery refresh',price:11.5,image:images[0],images,stockOnHand:20,stockQty:20,minQty:1,isExtendedRange:true};
rememberAuthSession({access_token:'synthetic-local-fixture-only',user:{id:'10000000-0000-4000-8000-000000000001'}});
await new Promise((resolve,reject)=>{
 const request=indexedDB.open('proto-instore',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('collection');
 request.onerror=reject;
 request.onsuccess=()=>{const db=request.result,transaction=db.transaction('collection','readwrite');transaction.objectStore('collection').put({data:[{...product,images:[product.image]}],ts:Date.now()},'approved-customer-v1');transaction.oncomplete=()=>{db.close();resolve();};};
});
const root=createRoot(document.getElementById('root'));
window.galleryFixture={product,snapshot:instoreCatalogue,refresh:prefetchInstoreCatalogue,cached:()=>storedExtendedRange('',{includeCatalogue:true}),clear:()=>{root.unmount();clearStoredInstoreResponses();}};
root.render(<ExtendedRangePage initialQuery={product.sku} addToCart={()=>{}}/>);
