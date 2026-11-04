import {SARONGI_GALLERIES} from './sarongi-instore-gallery-data.mjs';

// Only attach these reviewed photos when the listing still points to a known
// member. A later image correction or image removal must never resurrect them.
export function sarongiInstoreGallery(sku, mainImage) {
  const photos=SARONGI_GALLERIES[sku];
  if(!photos||typeof mainImage!=='string')return [];
  let url;try{url=new URL(mainImage);}catch{return [];}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash
    ||!(['www.proto.co.za','proto.co.za'].includes(url.hostname)||/^protoportal-main-[a-z0-9-]+-proto-team\.vercel\.app$/.test(url.hostname)))return [];
  const main=photos.find(p=>p.path===url.pathname);if(!main)return [];
  return [main,...photos.filter(p=>p!==main)].map(p=>({label:p.label,image:new URL(p.path,url.origin).href}));
}
