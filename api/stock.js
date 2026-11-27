import {readBallsAuthority} from './_834-family.js';
import {readArrivedBridgeRow} from './_arrived-stock.js';
import { applyFloralLiveStock, isFloralLiveCode } from '../lib/floral-live-stock.mjs';
import { isSarongiRequestSku, sarongiRequestAvailability } from '../lib/sarongi-instore-requests.mjs';
import { mergeWebsiteOnlyIndex } from './_website-only-index.js';
import { runtimeWebsiteOnlyProvider } from './_website-only-runtime.js';
import { evaluateInstoreDuplicate } from '../lib/instore-duplicate-gate.mjs';
import { createStockClient } from '../lib/stock-supabase.mjs';
import { positillUnitObservation } from '../lib/positill-selling-unit.mjs';
import {readArrivedStockRecords,effectiveArrivedStock} from './_arrived-stock.js';
import {verifyCat07Row,cat07RowProof} from './_cat07-family.js';
import { getApprovedCustomer, requireAuth } from './_auth.js';
import { availabilityForRow, loadIncomingAvailability } from './_product-availability.js';
import { buildExtendedRangeProducts, buildPreviewProducts, isIsolatedPreviewRequest, previewCatalogueClient, signPreviewImages, stockClient } from './extended-range.js';

// Live, on-demand stock lookup for the customer-facing "Check Stock" button.
// Always hits the DB fresh (no-store) so a click never serves a cached number.
//
// Stock is tracked at the source-product level: products.sku = website_stock.barcode.
// One barcode maps to several variant rows that share the same stock, so we match
// on barcode first (the value shown on the card as product.code), then fall back to
// the website sku. Reads website_stock, which carries stock_qty synced from
// public.products via sync_website_from_products().

// Accept uppercase letters, digits and dashes (real SKUs/barcodes), sane max length.
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{0,63}$/;

export function validateInstoreBridgeStock(sku, row) {
  if (typeof row?.CODE !== 'string' || row.CODE.trim().toUpperCase() !== sku) throw new Error('Instore bridge returned a different product');
  if (isSarongiRequestSku(sku)) {
    const unit = positillUnitObservation(sku, row);
    const complete = ['ONHAND', 'BOOKED'].every(field => ['number', 'string'].includes(typeof row?.[field]) && String(row[field]).trim() !== '' && Number.isFinite(Number(row[field]))) && Number(row.BOOKED) >= 0;
    const qty = complete ? Math.floor(Number(row.ONHAND) - Number(row.BOOKED)) : null;
    const availability = qty !== null && qty > 0 ? { state: 'in_stock', label: 'In stock', canOrder: true } : { state: 'out_of_stock', label: 'Out of stock', canOrder: false };
    return { ...unit, qty, availability: sarongiRequestAvailability(sku, availability) };
  }
  for (const field of ['ONHAND', 'BOOKED']) {
    const value = row?.[field];
    if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) throw new Error('Instore bridge returned incomplete stock');
  }
  const onHand = Number(row.ONHAND);
  const booked = Number(row.BOOKED);
  if (booked < 0) throw new Error('Instore bridge returned invalid booked stock');
  const qty = Math.max(0, Math.floor(onHand - booked));
  return { ...positillUnitObservation(sku, row), qty, availability: qty > 0 ? { state: 'in_stock', label: 'In stock', canOrder: true } : { state: 'out_of_stock', label: 'Out of stock', canOrder: false } };
}

export async function readFreshInstoreStock(sku, { includeStaged = false, websiteOnlyRows = [], websiteOnlyProvider = null, indexClient = stockClient(), fetchBridge = fetch, bridgeEnv = process.env } = {}) {
  const [{ data, error },listing] = await Promise.all([indexClient.from('extended_range_items')
    .select('sku, image_source, image_source_key, barcode, title, original_description, price, available_stock, minimum_stock, category, image_url, image_review_status, visibility_status, is_active')
    .eq('sku', sku).limit(1),indexClient.from('instore_listing_controls').select('sku,status').in('sku',[sku])]);
  if (error||listing.error) throw error||listing.error;
  if(!Array.isArray(listing.data)||listing.data.length>1||listing.data.some(row=>row?.sku!==sku||!['visible','hidden'].includes(row.status)))throw Error('Instore listing controls unavailable');
  // A cached card must not re-verify its selling unit or availability after
  // this SKU was hidden. Check every actual/supplemental Instore row before
  // provider evidence, bridge reads or product availability, not only CAT07.
  if(listing.data.some(row=>row.status==='hidden'))return null;
  if (websiteOnlyProvider) websiteOnlyRows=(await websiteOnlyProvider({skus:[sku]})).rows;
  if(sku==='8640000274'){
    if(data?.length!==1)return null;
    const normal=await indexClient.from('website_stock').select('sku,barcode').or(`sku.eq.${sku},barcode.eq.${sku}`);
    if(normal.error)throw Error('Christmas listing controls unavailable');
    if(normal.data?.length)return null;
    const verified=await verifyCat07Row(data[0],{client:indexClient,env:bridgeEnv,read:async(code,{env})=>{
      const base=String(env.STOCK_SQL_BRIDGE_URL||'').trim().replace(/\/$/,''),key=String(env.STOCK_SQL_BRIDGE_KEY||'').trim();if(!base.startsWith('https://')||!key)throw Error('Current stock unavailable');
      const response=await fetchBridge(base+'/stmast',{method:'POST',redirect:'error',headers:{'content-type':'application/json','x-api-key':key},body:JSON.stringify({sku:code}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Current stock unavailable');return (await response.json())?.row;
    }});
    const source=cat07RowProof(verified).source;
    return {sku,qty:source.available,price:source.priceInclVat,unitsOfIssue:'EACH',unitsOfIssueRaw:'EACH',unitsOfIssueSource:'positill_live',unitsOfIssueVerified:true,availability:{state:source.available>0?'in_stock':'out_of_stock',label:source.available>0?'In stock':'Out of stock',canOrder:source.available>0}};
  }
  const arrivals=await readArrivedStockRecords(indexClient,[sku]);
  // Only a verified server-side receipt may defer the index's stale quantity
  // gate. Current bridge stock/unit/price still decide the actual response.
  const extra=websiteOnlyRows.filter(row=>String(row.sku||'').trim().toUpperCase()===sku);
  if (extra.length) {
    const controlReads=Promise.all([
      indexClient.from('website_stock').select('sku, barcode').in('sku',[sku]),
      indexClient.from('website_stock').select('sku, barcode').in('barcode',[sku]),
    ]);
    const [bySku,byBarcode]=await controlReads;
    if (bySku.error||byBarcode.error) throw new Error('Website-only controls unavailable');
    const duplicate=evaluateInstoreDuplicate({sku,barcode:sku},{status:'success',complete:true,variantsIncluded:true,checkedIdentifiers:[sku],rows:[...(bySku.data||[]),...(byBarcode.data||[])]});
    if (duplicate.decision!=='eligible') return null;
  }
  const product = buildExtendedRangeProducts(mergeWebsiteOnlyIndex(data || [],extra), '', { includeStaged,ignoreStockEligibility:arrivals.has(sku) })[0];
  if (!product) return null;
  const base = String(bridgeEnv.STOCK_SQL_BRIDGE_URL || '').trim().replace(/\/$/, '');
  const key = String(bridgeEnv.STOCK_SQL_BRIDGE_KEY || '').trim();
  if (!base.startsWith('https://') || !key) throw new Error('Instore bridge is not configured');
  const response = await fetchBridge(`${base}/stmast`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify({ sku }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Instore bridge returned ${response.status}`);
  const row = (await response.json())?.row;
  const current = isSarongiRequestSku(sku) ? validateInstoreBridgeStock(sku, row)
    : effectiveArrivedStock(sku,row,arrivals.get(sku))||validateInstoreBridgeStock(sku, row);
  return { ...current, availability: sarongiRequestAvailability(sku, current.availability) };
}

export function createStockHandler({authenticate=requireAuth,approve=getApprovedCustomer,getClient=createStockClient,websiteOnlyProvider=null,fetchBridge=fetch,bridgeEnv=process.env,publicTransport=globalThis.fetch}={}) {
return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sku = String(req.query.sku || '').trim().toUpperCase();
  if (!sku || !SKU_RE.test(sku)) {
    return res.status(400).json({ error: 'Invalid or missing sku' });
  }

  try {
    const user = await authenticate(req, res);
    if (!user) return;

    // A preview product always uses the isolated snapshot. It is deliberately
    // unable to fall back to website_stock or the SQL bridge.
    if (req.query.source === 'instore-preview') {
      if (!isIsolatedPreviewRequest(req)) return res.status(404).json({ error: 'Preview stock is not available here' });
      const access = await approve(user, res);
      if (!access) return;
      const { client, runId } = previewCatalogueClient();
      const { data: run, error: runError } = await client.from('preview_instore_runs')
        .select('id, status').eq('id', runId).maybeSingle();
      if (runError || run?.status !== 'ready') throw new Error('Isolated Instore preview is not ready');
      const { data, error } = await client.from('preview_instore_items')
        .select('sku, barcode, title, price_incl_vat, available_stock, department, image_object_path')
        .eq('run_id', runId).eq('sku', sku).limit(1);
      if (error) throw error;
      const product = buildPreviewProducts(await signPreviewImages(client, runId, data || []))[0];
      if (!product) return res.status(404).json({ error: 'SKU not found' });
      return res.status(200).json({
        sku, qty: product.stockQty, keep_live_when_oos: false, to_order: false,
        available_stock: product.stockQty, stock_qty: product.stockQty,
        availability: product.availability, checked_at: new Date().toISOString(),
      });
    }

    const includeStaged = false;
    const supabase = getClient();

    // Authentication must complete first, but the independent approval and
    // stock reads can run together. This removes one full database round trip
    // from every live stock check without caching or weakening either rule.
    const [access, stockResult] = await Promise.all([
      approve(user, res),
      supabase
        .from('website_stock')
        .select('sku, barcode, stock_qty, available_stock, keep_live_when_oos, to_order, image_url_one, units_of_issue')
        .or(`barcode.eq.${sku},sku.eq.${sku}`)
        .limit(1),
    ]);
    if (!access) return;

    const { data, error } = stockResult;

    if (error) throw error;
    if (!data || data.length === 0) {
      const instore = await readFreshInstoreStock(sku, { includeStaged,websiteOnlyProvider,indexClient:supabase,fetchBridge,bridgeEnv });
      if (!instore) return res.status(404).json({ error: 'SKU not found' });
      return res.status(200).json({ ...instore, sku, qty: instore.qty, keep_live_when_oos: false, to_order: false, available_stock: instore.qty, stock_qty: null, availability: instore.availability, checked_at: new Date().toISOString() });
    }

    const row = data[0];
    if(sku==='8-34'){
      const {source}=await readBallsAuthority(supabase,row,{env:bridgeEnv,transport:publicTransport,read:(code,{env})=>readArrivedBridgeRow(code,{env,transport:fetchBridge})});
      return res.status(200).json({sku,qty:source.available,price:source.priceInclVat,unitsOfIssue:'10PC',available_stock:source.available,stock_qty:source.available,to_order:false,keep_live_when_oos:false,availability:{state:source.available>0?'in_stock':'out_of_stock',label:source.available>0?'In stock':'Out of stock',canOrder:source.available>0},checked_at:source.observedAt});
    }
    const code = String(row.barcode || row.sku || '').trim().toUpperCase();
    if (isFloralLiveCode(code)) {
      const incoming = await loadIncomingAvailability(supabase, row.sku);
      const [live] = await applyFloralLiveStock([{ barcode: code, toOrder: !!row.to_order, availability: incoming }], { fetchBridge, bridgeEnv });
      return res.status(200).json({ sku, qty: live.stockQty, available_stock: live.stockQty, stock_qty: live.stockQty, keep_live_when_oos: !!row.keep_live_when_oos, to_order: !!row.to_order, availability: live.availability, stock_source: live.stockSource, checked_at: live.stockCheckedAt });
    }

    // available_stock is SOH (what Bladerunner/cron writes); stock_qty is the raw figure.
    const avail = Number(row.available_stock);
    const raw = Number(row.stock_qty);
    const qty = Number.isFinite(avail) ? avail : (Number.isFinite(raw) ? raw : 0);
    const incoming = await loadIncomingAvailability(supabase, row.sku);
    const availability = availabilityForRow(row, incoming);
    return res.status(200).json({
      sku,
      qty,
      keep_live_when_oos: !!row.keep_live_when_oos,
      to_order: !!row.to_order,
      available_stock: Number.isFinite(avail) ? avail : null,
      stock_qty: Number.isFinite(raw) ? raw : null,
      availability,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('stock api error:', err?.message || err);
    return res.status(502).json({ error: 'Stock lookup failed' });
  }
}
}

export default createStockHandler({websiteOnlyProvider:runtimeWebsiteOnlyProvider});
