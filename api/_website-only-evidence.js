// Isolated candidate: this adapter only reads. All dependencies are explicit;
// no configuration is altered and no database, stock, cache or order is written.
import {websitePriceFromExVat} from '../lib/catalogue-price.mjs';
import {readCompleteRows} from './_complete-rows.js';
import {readArrivedBridgeRow} from './_arrived-stock.js';

export function createWebsiteIdentifiersReader({client}) {
  if(!client||typeof client.from!=='function') throw Error('Website catalogue client unavailable');
  return async () => {
    const identifiers=[];let expected=null;
    for(let offset=0;offset<100000;offset+=1000) {
      const result=await client.from('products').select('code',{count:'exact'}).order('code',{ascending:true}).range(offset,offset+999);
      if(result.error||!Array.isArray(result.data)||!Number.isInteger(result.count)||result.count<0||result.count>100000
        || (expected!==null&&expected!==result.count)) throw Error('Website catalogue evidence incomplete');
      expected=result.count;
      if(result.data.length!==Math.min(1000,Math.max(0,expected-offset))) throw Error('Website catalogue evidence truncated');
      for(const row of result.data) if(typeof row.code==='string'&&row.code.trim()) identifiers.push(row.code);
      if(offset+result.data.length>=expected) return {complete:true,identifiers};
      if(result.data.length!==1000) throw Error('Website catalogue evidence truncated');
    }
    throw Error('Website catalogue evidence exceeds limit');
  };
}

// Read the full existing index and controls; a partial read must never be
// mistaken for evidence that a product does not already exist. The separate
// Website-project identifier reader is mandatory and must also be complete.
export function createCatalogueControlsReader({client,readWebsiteIdentifiers}) {
  if(!client || typeof client.from!=='function' || typeof readWebsiteIdentifiers!=='function') throw Error('Incomplete catalogue reader');
  return async () => {
    const [index,main,listing,image,website]=await Promise.all([
      readCompleteRows(()=>client.from('extended_range_items').select('sku, barcode',{count:'exact'})),
      readCompleteRows(()=>client.from('website_stock').select('sku, barcode',{count:'exact'})),
      readCompleteRows(()=>client.from('instore_listing_controls').select('sku, status',{count:'exact'})),
      readCompleteRows(()=>client.from('instore_image_controls').select('sku, status',{count:'exact'})),
      readWebsiteIdentifiers(),
    ]);
    if(!website?.complete || !Array.isArray(website.identifiers)) throw Error('Website catalogue evidence incomplete');
    return {existing:{complete:true,identifiers:[...index,...main].flatMap(r=>[r.sku,r.barcode]).filter(Boolean).concat(website.identifiers)},
      controls:{complete:true,hiddenListings:listing.filter(r=>String(r.status).toLowerCase()==='hidden').map(r=>r.sku),
        hiddenImages:image.filter(r=>String(r.status).toLowerCase()==='hidden').map(r=>r.sku)}};
  };
}

export function createReadOnlyEvidenceReader({readCatalogueAndControls,readBridge,now=Date.now,wallClock=Date.now,concurrency=4,cacheMs=0,deadlineMs=0,retryOnce=false}) {
  if(typeof readCatalogueAndControls!=='function'||typeof readBridge!=='function'||typeof now!=='function'
    || !Number.isInteger(concurrency)||concurrency<1||concurrency>8) throw Error('Invalid read-only evidence setup');
  const cached = new Map();
  return async ({skus}) => {
    if(!Array.isArray(skus)||new Set(skus).size!==skus.length||skus.some(s=>!/^[-A-Z0-9]{1,64}$/.test(s))) throw Error('Invalid requested product codes');
    const controls=await readCatalogueAndControls({skus});
    if(!controls?.existing?.complete||!controls?.controls?.complete||!Array.isArray(controls.existing.identifiers)
      || !Array.isArray(controls.controls.hiddenListings)||!Array.isArray(controls.controls.hiddenImages)) throw Error('Incomplete catalogue/control evidence');
    const observations=[], failures=[];let next=0;
    const deadline = deadlineMs ? wallClock()+deadlineMs : Infinity;
    const worker=async()=>{while(next<skus.length){
      const sku=skus[next++];
      try {
        const old = cached.get(sku);
        if (cacheMs > 0 && old && now() >= old.observedAt && now()-old.observedAt < cacheMs) { observations.push(old); continue; }
        if (wallClock() >= deadline) throw Error('Source deadline reached');
        let row;
        try { row=await readBridge(sku); }
        catch (error) {
          if (!retryOnce || wallClock()>=deadline) throw error;
          row=await readBridge(sku);
        }
        if(String(row?.CODE||'').trim().toUpperCase()!==sku || typeof row?.DESCR!=='string' || !row.DESCR.trim()
          || typeof row?.UNITS!=='string' || !row.UNITS.trim()
          || !['string','number'].includes(typeof row.ONHAND) || String(row.ONHAND).trim()===''
          || !['string','number'].includes(typeof row.BOOKED) || String(row.BOOKED).trim()===''
          || !['string','number'].includes(typeof row.PRICE_A) || String(row.PRICE_A).trim()==='') throw Error('Incomplete source');
        const onHand=Number(row.ONHAND),booked=Number(row.BOOKED),price=websitePriceFromExVat(Number(row.PRICE_A));
        if(!Number.isFinite(onHand)||!Number.isFinite(booked)||booked<0||!Number.isFinite(price)||price<=0) throw Error('Invalid source values');
        const observation={sku,found:true,description:row.DESCR.trim(),units:row.UNITS.trim(),price,onHand,booked,observedAt:now()};
        observations.push(observation);
        if (cacheMs > 0) cached.set(sku,observation);
      } catch {failures.push(sku);}
    }};
    await Promise.all(Array.from({length:Math.min(concurrency,skus.length)},worker));
    return {existing:controls.existing,controls:controls.controls,observations,failures};
  };
}

// Uses the existing read-only Positill bridge and two server-side read clients.
// The injected transport allows isolated tests to prove no network writes.
export function createLiveReadOnlyEvidenceReader({stockClient,websiteClient,env=process.env,transport=globalThis.fetch,now=Date.now}) {
  const readWebsiteIdentifiers=createWebsiteIdentifiersReader({client:websiteClient});
  const readCatalogueAndControls=createCatalogueControlsReader({client:stockClient,readWebsiteIdentifiers});
  const boundedTransport=(url,options)=>transport(url,{...options,signal:AbortSignal.any([options.signal,AbortSignal.timeout(4000)])});
  return createReadOnlyEvidenceReader({readCatalogueAndControls,readBridge:sku=>readArrivedBridgeRow(sku,{env,transport:boundedTransport}),now,concurrency:4,cacheMs:30000,deadlineMs:20000,retryOnce:true});
}
