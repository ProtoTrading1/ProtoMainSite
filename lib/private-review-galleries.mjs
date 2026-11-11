// Attach only when the current source confirms the gallery's main image.
// This also lets an older cached catalogue immediately show the new main.
const ROOT='https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/existing-review/';
export function attachPrivateReviewGalleries(products,rows){
 const galleries=new Map();
 for(const row of rows||[]){
  const sku=String(row?.sku||'').trim().toUpperCase(),urls=row?.image_urls;
  if(!sku||!Array.isArray(urls)||urls.length<1||urls.length>17||new Set(urls).size!==urls.length||row.current_image!==urls[0]||urls.some(url=>typeof url!=='string'||!url.startsWith(ROOT)))continue;
  galleries.set(sku,urls);
 }
 return (products||[]).map(product=>{
  const urls=galleries.get(String(product?.sku||'').trim().toUpperCase());
  return urls&&product.imageStatus!=='hidden'?{...product,image:urls[0],images:[...urls]}:product;
 });
}
