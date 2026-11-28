// Optional receipt-backed secondary photos enrich already eligible Instore
// products. They never change the canonical main, identity or ordering data.
const MANAGED_ROOT='https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/instore-secondary-v1/';
const managedNamespace=value=>typeof value==='string'&&value.startsWith(MANAGED_ROOT);
// Initial append workflow is deliberately limited to these reviewed products.
const SUPPORTED_SKUS=new Set(['8622930082','8622930083']);
const PROTOCOL='proto.instore-secondary-gallery.v1';
const UUID='[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const MANAGED=new RegExp('^https://yiqsvwajozafvalwcero\\.supabase\\.co/storage/v1/object/public/product-images/instore-secondary-v1/('+UUID+')/([a-f0-9]{64})\\.png$');
const HASH=/^[a-f0-9]{64}$/;
const VERSION=/^(0|[1-9][0-9]{0,17})$/;
const operation=new RegExp('^'+UUID+'$');
const keys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...expected].sort().join(',');
const same=(one,two)=>JSON.stringify(one)===JSON.stringify(two);
const url=value=>{try{const parsed=new URL(value);return typeof value==='string'&&value.length<=2048&&parsed.protocol==='https:'&&!parsed.username&&!parsed.password;}catch{return false;}};
const main=product=>product?.image||product?.imageUrl||product?.images?.[0]||'';
function withoutManagedExtras(product){
 if(!product||!Array.isArray(product.images))return product;
 const primary=main(product),images=product.images.filter(image=>image===primary||!managedNamespace(image));
 return same(images,product.images)?product:{...product,images};
}
function baseImages(product){const primary=main(product);return Array.isArray(product.images)&&product.images.length?product.images:[primary];}
function candidate(product){return SUPPORTED_SKUS.has(product?.sku)&&product?.isExtendedRange===true&&product.imageStatus!=='hidden'&&!product.cat07Family
 &&typeof product.sku==='string'&&product.sku.length>0&&product.sku.length<=128&&HASH.test(product.instoreSourceIdentity||'')
 &&url(main(product))&&baseImages(product)[0]===main(product);}

export async function attachInstoreSecondaryGalleries(products,client,{generation,timeoutMs=2000}={}){
 if(!Array.isArray(products))return products;
 const clean=products.map(withoutManagedExtras);
 if(!VERSION.test(String(generation))||typeof generation!=='string'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)return clean;
 const candidates=clean.filter(candidate),skus=[...new Set(candidates.map(product=>product.sku))],found=new Map();
 if(!skus.length)return clean;
 try{
  const reader=typeof client==='function'?client():client,deadline=Date.now()+timeoutMs;
  for(let start=0;start<skus.length;start+=100){
   const cohort=skus.slice(start,start+100),remaining=deadline-Date.now();if(remaining<=0)throw Error('Secondary gallery timeout');
   const controller=new AbortController();let timer,result;
   try{
    const query=reader.rpc('instore_secondary_gallery_read_v1',{p_body:{skus:cohort}});
    const read=typeof query?.abortSignal==='function'?query.abortSignal(controller.signal):query;
    result=await Promise.race([
    read,
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Secondary gallery timeout'));},remaining);}),
   ]);}finally{clearTimeout(timer);controller.abort();}
   const {data,error}=result;
   if(error||!keys(data,['protocol','galleries','generation'])||data.protocol!==PROTOCOL||data.generation!==generation
    ||!Array.isArray(data.galleries)||data.galleries.length>cohort.length)throw Error('Secondary gallery unavailable');
   for(const gallery of data.galleries){
    if(!keys(gallery,['sku','sourceIdentitySHA','mainUrl','baseImageUrls','imageUrls','managedImageUrls','revision','operationId'])
     ||!cohort.includes(gallery.sku)||found.has(gallery.sku)||!HASH.test(gallery.sourceIdentitySHA)
     ||!Number.isSafeInteger(gallery.revision)||gallery.revision<1||!operation.test(gallery.operationId)
     ||!Array.isArray(gallery.baseImageUrls)||!gallery.baseImageUrls.length||gallery.baseImageUrls.length>31
     ||!Array.isArray(gallery.managedImageUrls)||!gallery.managedImageUrls.length||gallery.managedImageUrls.length>31
     ||!Array.isArray(gallery.imageUrls)||gallery.imageUrls.length>32||gallery.imageUrls.length<2
     ||gallery.mainUrl!==gallery.baseImageUrls[0]||gallery.mainUrl!==gallery.imageUrls[0]
     ||gallery.baseImageUrls.some(image=>!url(image)||managedNamespace(image))
     ||gallery.managedImageUrls.some(image=>typeof image!=='string'||!MANAGED.test(image))
     ||new Set(gallery.imageUrls).size!==gallery.imageUrls.length
     ||!same(gallery.imageUrls,[...gallery.baseImageUrls,...gallery.managedImageUrls]))throw Error('Secondary gallery invalid');
    found.set(gallery.sku,gallery);
   }
  }
 }catch{return clean;}
 return clean.map(product=>{
  const gallery=found.get(product?.sku);
  return candidate(product)&&gallery?.sourceIdentitySHA===product.instoreSourceIdentity&&gallery.mainUrl===main(product)
   &&same(gallery.baseImageUrls,baseImages(product))?{...product,images:[...gallery.imageUrls]}:product;
 });
}
