import {createHash} from 'node:crypto';
import {BALLS_SKU,validateBallsGallery,ballsReceiptEnvelope} from './834-customer-gallery.mjs';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const ballsManifestHash=r=>createHash('sha256').update(JSON.stringify(canonical(ballsReceiptEnvelope(r)))).digest('hex');
const hold=message=>{throw Object.assign(Error(message),{status:409});};
export function resolveBallsOrder(items,{receipt,row,source,now=Date.now()}={}){
 validateBallsGallery(receipt);if(ballsManifestHash(receipt)!==receipt.manifestHash||row?.sku!==BALLS_SKU||row.barcode!==BALLS_SKU||row.image_url_one!==receipt.views[0].image.url||row.units_of_issue!=='10PC'||row.to_order===true)hold('Christmas ball listing or main changed.');
 const observed=Date.parse(source?.observedAt);
 if(source?.canonicalCode!==BALLS_SKU||source.authority!=='live-exact-code-observation'||source.units!=='10PC'||!Number.isFinite(source.priceInclVat)||source.priceInclVat<=0||![source.onHand,source.booked,source.available].every(Number.isSafeInteger)||source.booked<0||source.available!==source.onHand-source.booked||source.available<=0||!Number.isFinite(observed)||now-observed<0||now-observed>60000)hold('Current Christmas ball stock, price and selling unit must be refreshed.');
 if(!Array.isArray(items)||!items.length||items.length>250)hold('Choose a colour and quantity.');let total=0;
 const lines=items.map(item=>{if((item?.product?.sku||item?.product?.id)!==BALLS_SKU||!Number.isSafeInteger(item.qty)||item.qty<1)hold('Invalid Christmas ball quantity.');const view=receipt.views.find(v=>v.label===item.preference);if(!view)hold('Choose one of the six reviewed Christmas ball colours.');total+=item.qty;if(!Number.isSafeInteger(total)||total>source.available)hold('Only '+source.available+' tubes are available across all colours.');return {qty:item.qty,preference:view.label,product:{id:BALLS_SKU,sku:BALLS_SKU,code:BALLS_SKU,barcode:BALLS_SKU,name:'CHRISTMAS BAUBLES | 6CM | 10PC TUBE',price:source.priceInclVat,unitsOfIssue:'10PC',casePack:'10PC',image:view.image.url,remoteImage:view.image.url,isExtendedRange:false,minQty:1}};});
 return {items:lines,totalQuantity:total,sharedAvailable:source.available,total:Math.round(total*source.priceInclVat*100)/100};
}
