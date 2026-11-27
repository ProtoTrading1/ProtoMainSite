import {resolveProductAvailability} from '../../lib/product-availability.mjs';
import {isFloralLiveCode} from '../../lib/floral-live-stock.mjs';

export const CATALOGUE_STOCK_MAX_AGE = 30000;
const text=value=>String(value||'').trim().toUpperCase();
function separateContract(product){
  const identifiers=[product?.sku,product?.id,product?.barcode,product?.code].map(text);
  return product?.isExtendedRange||identifiers.some(code=>['8-34','8640000274'].includes(code)||isFloralLiveCode(code));
}
export function scrubCachedShowroomProduct(product,now=Date.now()){
  if(!product||typeof product!=='object'||separateContract(product))return product;
  if(product.isVariantGroup){
    const variants=(product.variants||[]).map(row=>scrubCachedShowroomProduct(row,now));
    return variants.every((row,index)=>row===product.variants[index])?product:{...product,variants};
  }
  const stamp=Date.parse(product.stockCheckedAt),qty=product.stockOnHand??product.stockQty;
  if(product.stockSource==='positill_live'&&typeof product.stockCheckedAt==='string'&&Number.isFinite(stamp)&&now-stamp>=0&&now-stamp<=CATALOGUE_STOCK_MAX_AGE&&Number.isSafeInteger(qty)&&qty>=0)return product;
  const availability=resolveProductAvailability({stockQty:null,toOrder:Boolean(product.toOrder||product.to_order||product.orderableWhenOutOfStock||product.orderable_when_out_of_stock),incoming:{...product,...product.availability}});
  if(!availability.canOrder){availability.label='Stock unavailable';availability.guidance='Please check again. Availability is confirmed when packing.';}
  // Keep the long-lived catalogue metadata/photos, never its old balance.
  if(product.stockSource==='unavailable'&&product.stockQty===null&&product.stockOnHand===null&&product.stock_qty===null&&product.available_stock===null&&product.stockCheckedAt===null&&product.inStock===false)return product;
  return {...product,stockQty:null,stockOnHand:null,stock_qty:null,available_stock:null,inStock:false,availability,stockSource:'unavailable',stockCheckedAt:null};
}
export function scrubCachedShowroomStock(products,now=Date.now()){
  if(!Array.isArray(products))return [];
  const scrubbed=products.map(product=>scrubCachedShowroomProduct(product,now));
  return scrubbed.every((product,index)=>product===products[index])?products:scrubbed;
}
