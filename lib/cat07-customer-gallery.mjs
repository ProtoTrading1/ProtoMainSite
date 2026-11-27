import reviewed from './cat07-reviewed-views.json' with {type:'json'};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const hash=/^[a-f0-9]{64}$/;
const fields=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const hold=()=>{throw Object.assign(Error('This Christmas family needs its completed photo review before ordering.'),{status:409});};
export const CAT07_SKU='8640000274';
export const CAT07_HISTORICAL_ALIASES=Object.freeze(reviewed.styles.map(style=>style.legacySku).filter(Boolean));
export const isCat07HistoricalAlias=value=>typeof value==='string'&&CAT07_HISTORICAL_ALIASES.includes(value.trim().toUpperCase());
export function cat07HistoricalAliasMatches(product,identifier){return cat07CustomerOptions(product).length===8&&CAT07_HISTORICAL_ALIASES.some(alias=>alias.replace(/[^A-Z0-9]/g,'')===identifier);}
export function cat07ReceiptEnvelope(receipt){return Object.fromEntries(['protocol','receiptId','sku','barcode','destination','mainViewId','views'].map(key=>[key,receipt[key]]));}
// Presentation validation only. The server receipt reader verifies completion,
// authoritative row/main and digest before returning this to clients.
// There is deliberately no RPC, network read or publication capability here.
export function validateCat07Gallery(receipt){
 if(!fields(receipt,['status','protocol','receiptId','sku','barcode','destination','mainViewId','views','manifestHash'])
  ||receipt.status!=='complete'||receipt.protocol!=='proto.cat07-family-publication.v1'||!uuid.test(receipt.receiptId)
  ||receipt.sku!==CAT07_SKU||receipt.barcode!==CAT07_SKU||receipt.destination!=='instore'
  ||!hash.test(receipt.manifestHash)||!Array.isArray(receipt.views)||receipt.views.length!==9)hold();
 const expected=[{id:'overview',role:'overview',label:'Saved family reference overview',...reviewed.overview},
  ...reviewed.styles.map(style=>({id:'style-'+style.attachment,role:'style',...style}))];
 const urls=new Set();
 for(let i=0;i<9;i++){
  const view=receipt.views[i],pin=expected[i];
  if(!fields(view,['id','role','label','original','image'])||view.id!==pin.id||view.role!==pin.role||view.label!==pin.label
   ||!fields(view.original,['sha256','size','mime'])||view.original.sha256!==pin.sha256||view.original.size!==pin.size||view.original.mime!=='image/jpeg'
   ||!fields(view.image,['url','sha256','size','mime'])||!hash.test(view.image.sha256)||view.image.mime!=='image/png'
   ||!Number.isSafeInteger(view.image.size)||view.image.size<1||view.image.size>1048576
   ||view.image.url!==`https://admin.proto.co.za/api/cat07-family-image/${receipt.receiptId}/${view.id}/${view.image.sha256}.png`
   ||urls.has(view.image.url))hold();
  urls.add(view.image.url);
 }
 if(!receipt.views.some(view=>view.id===receipt.mainViewId))hold();
 return receipt;
}
export function cat07CustomerOptions(product){
 if(!product||product.sku!==CAT07_SKU||product.barcode!==CAT07_SKU||product.isVariantGroup||product.imageStatus==='hidden')return [];
 try{
  const receipt=validateCat07Gallery(product.cat07Family),urls=receipt.views.map(view=>view.image.url);
  const main=receipt.views.find(view=>view.id===receipt.mainViewId).image.url;
  const chosen=product.cat07SelectedViewId?receipt.views.find(view=>view.id===product.cat07SelectedViewId&&view.role==='style'):null;
  const displayed=chosen?.image.url||main,canonicalOrder=[main,...urls.filter(url=>url!==main)];
  const expectedOrder=[displayed,...canonicalOrder.filter(url=>url!==displayed)];
  if(!Array.isArray(product.images)||product.images.length!==9||new Set(product.images).size!==9
    ||product.images.some((url,i)=>url!==expectedOrder[i])||product.image!==displayed
    ||product.cat07SelectedViewId&&(!chosen||product.cat07CanonicalMain!==main))return [];
  return receipt.views.filter(view=>view.role==='style').map(view=>({label:view.label,image:view.image.url,id:view.id,stockAvailable:false}));
 }catch{return [];}
}
