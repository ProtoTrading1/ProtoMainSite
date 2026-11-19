// Receipt-backed galleries are separate from older private-review galleries.
// Only already-visible catalogue products can be enriched. No stock is changed.
const IMAGE=/^https:\/\/admin\.proto\.co\.za\/api\/archive-publication-image\/([a-f0-9]{64})\/([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/([a-f0-9]{64})\.png$/;
const main=p=>p?.images?.[0]||p?.image||p?.imageUrl||'';
export async function attachArchivePublicationGalleries(products,client,destination,{timeoutMs=2000}={}){
 if(!Array.isArray(products)||!['website','instore'].includes(destination))return products;
 const candidates=products.filter(p=>p.imageStatus!=='hidden'&&IMAGE.test(main(p))&&typeof p.sku==='string');
 if(!candidates.length)return products;
 const skus=[...new Set(candidates.map(p=>p.sku))],found=new Map();
 try{
  const reader=typeof client==='function'?client():client;
  const deadline=Date.now()+timeoutMs;
  for(let i=0;i<skus.length;i+=200){
   const selected=skus.slice(i,i+200);
   const remaining=deadline-Date.now();if(remaining<=0)throw Error('Gallery timeout');
   const {data,error}=await reader.rpc('loader_archive_publication_galleries_v1',{p_body:{destination,skus:selected}}).abortSignal(AbortSignal.timeout(remaining));
   if(error||!Array.isArray(data)||data.length>selected.length)throw Error('Gallery unavailable');
   for(const g of data){
    if(!g||Object.keys(g).sort().join(',')!=='currentImage,imageUrls,sku'||!selected.includes(g.sku)||found.has(g.sku)
     ||!Array.isArray(g.imageUrls)||g.imageUrls.length<2||g.imageUrls.length>8||g.currentImage!==g.imageUrls[0])throw Error('Gallery invalid');
    const anchor=IMAGE.exec(g.currentImage),ids=new Set();
    if(!anchor)throw Error('Gallery invalid');
    for(const url of g.imageUrls){const match=typeof url==='string'&&IMAGE.exec(url);if(!match||match[1]!==anchor[1]||ids.has(match[2]))throw Error('Gallery invalid');ids.add(match[2]);}
    found.set(g.sku,g);
   }
  }
 }catch{return products;}
 return products.map(p=>{const g=found.get(p.sku);return p.imageStatus!=='hidden'&&g?.currentImage===main(p)?{...p,images:[...g.imageUrls]}:p;});
}
