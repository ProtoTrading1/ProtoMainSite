import {SARONGI_GALLERIES, REVIEWED_FRAME_GALLERIES} from './sarongi-instore-gallery-data.mjs';
import {WEBSITE_ONLY_163_GALLERY} from './website-only-163-gallery.mjs';

// Only attach these reviewed photos when the listing still points to a known
// member. A later image correction or image removal must never resurrect them.
export function sarongiInstoreGallery(sku, mainImage) {
  const frames=Object.hasOwn(REVIEWED_FRAME_GALLERIES,sku) ? REVIEWED_FRAME_GALLERIES[sku] : null;
  const photos=frames || SARONGI_GALLERIES[sku] || WEBSITE_ONLY_163_GALLERY[sku];
  if(!photos||typeof mainImage!=='string')return [];
  let url;try{url=new URL(mainImage);}catch{return [];}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash
    ||(frames ? url.origin!=='https://admin.proto.co.za'
      : !(['www.proto.co.za','proto.co.za'].includes(url.hostname)||/^protoportal-main-[a-z0-9-]+-proto-team\.vercel\.app$/.test(url.hostname))))return [];
  const main=photos.find(p=>p.path===url.pathname);if(!main)return [];
  return [main,...photos.filter(p=>p!==main)].map(p=>({label:p.label,image:new URL(p.path,url.origin).href}));
}

// Completed frame publications store only the main in stock slots. Enrich only
// that exact known shape; additional or changed slots remain authoritative.
export function reviewedFrameStockImages(row) {
  const images=[row.image_url_one,row.image_url_two,row.image_url_three,row.image_url_four].filter(Boolean);
  if (!Object.hasOwn(REVIEWED_FRAME_GALLERIES,row.sku) || images.length!==1 || !row.image_url_one) return images;
  const reviewed=sarongiInstoreGallery(row.sku,row.image_url_one);
  return reviewed.length ? reviewed.map(photo=>photo.image) : images;
}
