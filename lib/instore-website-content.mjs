import { discoveryGroup } from './instore-discovery.mjs';
const validText=(value,max)=>value===null||typeof value==='string'&&value.length>0&&value.length<=max&&!/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
export function validateInstoreWebsiteContent(value) {
 if(!value||typeof value!=='object'||typeof value.generation!=='string'||!/^(0|[1-9][0-9]{0,17})$/.test(value.generation)
  ||!Array.isArray(value.overrides)||value.overrides.length>20000)throw Error('Website content snapshot invalid');
 const seen=new Set();
 for(const row of value.overrides){
  if(!row||typeof row.sku!=='string'||!/^[A-Z0-9][A-Z0-9._/-]{0,63}$/.test(row.sku)||seen.has(row.sku)
   ||typeof row.sourceIdentity!=='string'||!/^[a-f0-9]{64}$/.test(row.sourceIdentity)
   ||!validText(row.websiteTitle,180)||!validText(row.websiteDescription,4000)||typeof row.revision!=='string'||!/^[1-9][0-9]{0,17}$/.test(row.revision))throw Error('Website content row invalid');
  seen.add(row.sku);
 }
 return value;
}
// Pure presentation overlay on already-eligible products. Never mutate cached
// canonical objects, identities, classification, stock, prices or photos.
export function applyInstoreWebsiteContent(products,snapshot) {
 const overrides=new Map((snapshot?.overrides||[]).map(row=>[row.sku,row]));
 return products.map(product=>{
  const row=overrides.get(product.sku);if(!row||typeof row.sourceIdentity!=='string'||!/^[a-f0-9]{64}$/.test(row.sourceIdentity)||row.sourceIdentity!==product.instoreSourceIdentity)return product;
  return {...product,sourceDiscoveryGroup:discoveryGroup(product),
   name:row.websiteTitle??product.name,title:row.websiteTitle??product.title,
   description:row.websiteDescription??product.description,
   websiteContentRevision:row.revision,websiteContentGeneration:snapshot.generation};
 });
}
export function instoreContentMatchesProducts(products,snapshot){
 const overrides=new Map((snapshot?.overrides||[]).map(row=>[row.sku,row]));
 return products.every(product=>!overrides.has(product.sku)||typeof overrides.get(product.sku).sourceIdentity==='string'&&/^[a-f0-9]{64}$/.test(overrides.get(product.sku).sourceIdentity)&&overrides.get(product.sku).sourceIdentity===product.instoreSourceIdentity);
}
// Basket display can use the verified collection without changing saved basket
// identity, quantities, preferences, stock snapshots, prices or image choices.
export function refreshInstoreBasketText(items,products) {
 const bySku=new Map((products||[]).map(product=>[product.sku,product]));let changed=false;
 const next=items.map(item=>{
  if(item.product?.isExtendedRange!==true)return item;
  const current=bySku.get(item.product.sku||item.product.id);if(!current)return item;
  if(typeof item.product.instoreSourceIdentity!=='string'||item.product.instoreSourceIdentity!==current.instoreSourceIdentity)return item;
  if(item.product.name===current.name&&item.product.description===current.description)return item;
  changed=true;return {...item,product:{...item.product,name:current.name,title:current.title,description:current.description}};
 });
 return changed?next:items;
}
export function customerProductDescription(product) {
 return product?.isExtendedRange===true ? product.description||product.originalDescription : product?.originalDescription;
}
