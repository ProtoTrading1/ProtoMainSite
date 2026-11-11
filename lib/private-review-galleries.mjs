// Only galleries generated for the existing listing may augment it. The
// matching main image prevents a cached listing from displaying a newer,
// unrelated gallery against an older product record.
const ROOT='https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/existing-review/';
export function attachPrivateReviewGalleries(products,rows){
 const galleries=new Map();
 for(const row of rows||[]){
  const sku=String(row?.sku||'').trim().toUpperCase(),urls=row?.image_urls;
  if(!sku||!Array.isArray(urls)||urls.length<1||urls.length>17||new Set(urls).size!==urls.length||urls.some(url=>typeof url!=='string'||!url.startsWith(ROOT)))continue;
  galleries.set(sku,urls);
 }
 return (products||[]).map(product=>{
  const urls=galleries.get(String(product?.sku||'').trim().toUpperCase());
  return urls&&product.imageStatus!=='hidden'&&product.image===urls[0]?{...product,images:[...urls]}:product;
 });
}
