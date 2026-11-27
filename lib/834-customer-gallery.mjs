import reviewed from './834-reviewed-views.json' with {type:'json'};
export const BALLS_SKU='8-34';
export const BALLS_ALIASES=Object.freeze(['BLU','GLD','GRN','PNK','RED','SIL'].map(code=>'8-34-'+code));
export const isBallsAlias=value=>typeof value==='string'&&BALLS_ALIASES.includes(value.trim().toUpperCase());
export const ballsIdentifier=value=>typeof value==='string'&&(/^(?:834|8-34)$/i.test(value.trim())||BALLS_ALIASES.some(alias=>alias.replaceAll('-','')===value.trim().toUpperCase().replaceAll('-','')));
const fields=(v,k)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...k].sort().join(',');
const hold=()=>{throw Object.assign(Error('The Christmas ball colours need their completed photo review.'),{status:409});};
export const ballsReceiptEnvelope=r=>Object.fromEntries(['protocol','receiptId','sku','barcode','destination','mainViewId','views'].map(key=>[key,r[key]]));
// Presentation only: server RPC completion, digest, current row/source and public
// byte proofs are checked independently. Browser receipts never authorize orders.
export function validateBallsGallery(r){
 if(!fields(r,['status','protocol','receiptId','sku','barcode','destination','mainViewId','views','manifestHash'])||r.status!=='complete'||r.protocol!=='proto.834-public-family.v1'||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(r.receiptId)||r.sku!==BALLS_SKU||r.barcode!==BALLS_SKU||r.destination!=='website'||r.mainViewId!=='gold'||! /^[a-f0-9]{64}$/.test(r.manifestHash)||!Array.isArray(r.views)||r.views.length!==6)hold();
 for(let i=0;i<6;i++){const v=r.views[i],pin=reviewed[i];if(!fields(v,['id','role','label','image'])||v.id!==pin.id||v.role!=='colour'||v.label!==pin.label||!fields(v.image,['url','sha256','size','mime'])||Object.keys(pin.image).some(key=>v.image[key]!==pin.image[key]))hold();}
 return r;
}
export function ballsCustomerOptions(product){
 if(!product||product.sku!==BALLS_SKU||product.barcode!==BALLS_SKU||product.isExtendedRange||product.isVariantGroup||product.imageStatus==='hidden')return [];
 try{const receipt=validateBallsGallery(product.ballsFamily),urls=receipt.views.map(v=>v.image.url),chosen=product.ballsSelectedViewId?receipt.views.find(v=>v.id===product.ballsSelectedViewId):null;
 const displayed=chosen?.image.url||urls[0],order=[displayed,...urls.filter(url=>url!==displayed)];
 if(product.image!==displayed||!Array.isArray(product.images)||product.images.length!==6||product.images.some((url,i)=>url!==order[i])||product.ballsSelectedViewId&&(!chosen||product.ballsCanonicalMain!==urls[0]))return [];
 return receipt.views.map(v=>({id:v.id,label:v.label,image:v.image.url,stockAvailable:false}));}catch{return [];}
}
export function withBallsColour(product,preference){const selected=ballsCustomerOptions(product).find(v=>v.label===preference);if(!selected)return product;const urls=product.ballsFamily.views.map(v=>v.image.url);return {...product,image:selected.image,remoteImage:selected.image,localImage:selected.image,images:[selected.image,...urls.filter(url=>url!==selected.image)],ballsSelectedViewId:selected.id,ballsCanonicalMain:urls[0]};}
export function ballsAliasMatches(product,query){return ballsCustomerOptions(product).length===6&&ballsIdentifier(query);}
