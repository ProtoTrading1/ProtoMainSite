import {createHash} from 'node:crypto';
import {CAT07_SKU,cat07ReceiptEnvelope,validateCat07Gallery} from './cat07-customer-gallery.mjs';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const cat07ManifestHash=receipt=>createHash('sha256').update(JSON.stringify(canonical(cat07ReceiptEnvelope(receipt)))).digest('hex');
const held=message=>{throw Object.assign(Error(message),{status:409});};
// Pure server boundary shared by checkout and isolated previews. The adoption
// ledger's trusted completed-receipt reader and row controls run before this.
// The caller supplies server-owned receipt/index/source, never request fields.
export function resolveCat07OrderPreview(items,{receipt,indexRow,source,now=Date.now()}={}){
 validateCat07Gallery(receipt);
 if(cat07ManifestHash(receipt)!==receipt.manifestHash)held('Christmas photo review changed.');
 const main=receipt.views.find(view=>view.id===receipt.mainViewId).image.url;
 if(indexRow?.sku!==CAT07_SKU||indexRow.barcode!==CAT07_SKU||indexRow.destination!==receipt.destination||indexRow.image!==main||indexRow.hidden!==false)held('Christmas listing or main photo changed.');
 if(!source||source.authority!=='live-exact-code-observation'||source.canonicalCode!==CAT07_SKU||source.units!=='EACH'
  ||!Number.isFinite(source.priceInclVat)||source.priceInclVat<=0||![source.onHand,source.booked,source.available].every(Number.isSafeInteger)
  ||source.booked<0||source.available!==source.onHand-source.booked||source.available<=0)held('Current Christmas stock, price and selling unit must be verified.');
 const observed=typeof source.observedAt==='string'?Date.parse(source.observedAt):NaN;
 if(!Number.isSafeInteger(now)||!Number.isFinite(observed)||now-observed<0||now-observed>60000)held('Current Christmas stock must be refreshed.');
 if(!Array.isArray(items)||!items.length||items.length>250)held('Choose a Christmas style and quantity.');
 let total=0;const lines=items.map(item=>{
  if(item?.product?.sku!==CAT07_SKU||!Number.isSafeInteger(item.qty)||item.qty<1)held('Invalid Christmas style quantity.');
  const view=receipt.views.find(view=>view.role==='style'&&view.label===item.preference);
  if(!view)held('Choose one of the eight reviewed Christmas styles.');
  total+=item.qty;if(!Number.isSafeInteger(total)||total>source.available)held(`Only ${source.available} ornaments are available across all styles.`);
  return {qty:item.qty,preference:view.label,product:{id:CAT07_SKU,sku:CAT07_SKU,code:CAT07_SKU,barcode:CAT07_SKU,name:'CHRISTMAS HANGING ORNAMENT',price:source.priceInclVat,unitsOfIssue:'EACH',image:view.image.url,remoteImage:view.image.url,isExtendedRange:receipt.destination==='instore'}};
 });
 return {items:lines,totalQuantity:total,sharedAvailable:source.available,total:Math.round(lines.reduce((n,line)=>n+line.qty*line.product.price,0)*100)/100};
}
