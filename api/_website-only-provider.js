// Local integration candidate. The evidence source must be a trusted server
// adapter; this module performs no SQL writes, HTTP requests or order actions.
import {prepareWebsiteOnlyRows} from './_website-only-validation.mjs';

export function createWebsiteOnlyProvider({manifest,readEvidence,origin,now=Date.now,maxAgeMs=300000}) {
  if (!Array.isArray(manifest?.items) || typeof readEvidence !== 'function' || typeof now !== 'function') throw Error('Invalid provider setup');
  const base=new URL(origin);
  if(base.protocol!=='https:' || base.pathname!=='/' || base.search || base.hash) throw Error('Invalid photo origin');
  const allKeys=new Set();
  for(const item of manifest.items) {
    const k=String(item?.sku||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(!k || allKeys.has(k)) throw Error('Duplicate manifest identifier');
    allKeys.add(k);
  }
  return async function readWebsiteOnlyIndex({skus}={}) {
    const wanted=skus ? new Set(skus.map(s=>String(s||'').trim().toUpperCase())) : null;
    const selected=manifest.items.filter(item=>!wanted || wanted.has(String(item.sku||'').trim().toUpperCase()));
    if (!selected.length) return {rows:[],held:[]};
    const evidence=await readEvidence({skus:selected.map(x=>x.sku)});
    if (!evidence?.existing?.complete || !evidence?.controls?.complete || !Array.isArray(evidence.observations)
       || !Array.isArray(evidence.existing.identifiers) || !Array.isArray(evidence.controls.hiddenListings)
       || !Array.isArray(evidence.controls.hiddenImages)) throw Error('Website-only evidence unavailable');
    const seen=new Set(),rows=[],held=[];
    for(const item of selected) {
      const key=String(item?.sku||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
      if (!key || seen.has(key)) throw Error('Duplicate manifest identifier');
      seen.add(key);
      try {
        const source=evidence.observations.filter(x=>String(x.sku||'').trim().toUpperCase()===String(item.sku||'').trim().toUpperCase());
        const [verified]=prepareWebsiteOnlyRows({manifest:{items:[item]},observations:source,
          existing:evidence.existing,controls:evidence.controls,now:now(),maxAgeMs});
        // The real catalogue loader applies image controls after merging. Keep
        // the verified source URL here even if an image is currently hidden.
        const image=new URL(item.mainPath,base);
        if (image.origin!==base.origin || item.mainPath.startsWith('//')) throw Error('Photo origin mismatch');
        const image_url=image.href;
        rows.push({sku:verified.sku,barcode:verified.sku,title:verified.description,
          original_description:verified.description,price:verified.price,available_stock:verified.available,
          category:verified.category,image_url,image_source:'nutstore',image_review_status:'verified',
          visibility_status:'search_only',is_active:true});
      } catch(error) {held.push({sku:String(item?.sku||''),reason:String(error?.message||'Verification failed')});}
    }
    return {rows,held};
  };
}
