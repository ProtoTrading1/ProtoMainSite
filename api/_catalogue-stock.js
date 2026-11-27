import {readShowroomBatchStock} from '../lib/showroom-batch-stock.mjs';
import {overlayShowroomLiveStock,showroomSourceCode} from '../lib/showroom-live-stock.mjs';
import {isFloralLiveCode} from '../lib/floral-live-stock.mjs';

// Refresh all published identities before stock-based discovery, including
// cached-zero items whose cards would otherwise never mount. No DB writes.
export async function refreshCatalogueStock(products,{readStock=readShowroomBatchStock,...options}={}) {
  // Preserve the previously approved floral arrival/request policy and its
  // separate exact live source reader, applied by the catalogue caller.
  const preserved=new Set(products.filter(product=>{
    try{return isFloralLiveCode(showroomSourceCode(product));}catch{return false;}
  }));
  const eligible=products.filter(product=>!preserved.has(product));
  const codes=[...new Set(eligible.flatMap(product=>{
    try{return [showroomSourceCode(product)];}catch{return [];}
  }))];
  const observations=await readStock(codes,options);
  const refreshed=overlayShowroomLiveStock(eligible,observations);let index=0;
  return products.map(product=>preserved.has(product)?product:refreshed[index++]);
}
