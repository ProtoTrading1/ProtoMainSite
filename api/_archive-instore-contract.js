import { normalizeUnitsOfIssue } from '../lib/selling-unit.mjs';

export function isArchiveInstore(row) {
  return String(row?.image_source_key || '').startsWith('archive-review:');
}
export function archiveInstoreMetadata(row) {
  if (!isArchiveInstore(row)) return null;
  const metadata = row.archive_review;
  const price = Number(metadata?.price);
  const unit = String(metadata?.units_of_issue || '').trim();
  if (metadata?.sku !== row.sku || metadata?.requestId !== String(row.image_source_key).slice('archive-review:'.length)
    || metadata?.price_source !== 'positill_website_inclusive' || !Number.isFinite(price) || price <= 0
    || Number(row.price) !== price || !unit || /^(?:UNKNOWN|N\/?A|0|[-—])$/i.test(unit)) return null;
  return { price, unitsOfIssue: normalizeUnitsOfIssue(unit), minQty: Math.max(1, Math.floor(Number(metadata.min_order_qty) || 1)) };
}
export async function attachArchiveInstoreMetadata(client, rows) {
  const skus = rows.filter(isArchiveInstore).map(row => row.sku);
  if (!skus.length) return rows;
  const metadata = new Map();
  for (let start = 0; start < skus.length; start += 500) {
    let data; let error;
    try { ({ data, error } = await client.rpc('archive_review_catalogue_metadata', { p_skus: skus.slice(start, start + 500) })); } catch { error = true; }
    // Only archive-routed rows remain held when their new contract is missing.
    // Existing In-store products retain their established behavior.
    if (!error && Array.isArray(data)) for (const row of data) metadata.set(row.sku, row);
  }
  return rows.map(row => isArchiveInstore(row) ? { ...row, archive_review: metadata.get(row.sku) || null } : row);
}
export function resolveArchiveInstoreLine(item, indexRow, bridgeRow) {
  const metadata = archiveInstoreMetadata(indexRow);
  const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };
  if (!metadata) fail('Archive-routed In-store price or selling unit is unverified. Refresh before ordering.');
  const expected = String(indexRow.barcode || indexRow.sku).trim().toUpperCase();
  if (String(bridgeRow?.CODE || '').trim().toUpperCase() !== expected) fail('Exact live POS stock is unavailable for this Archive-routed product.');
  const rawOnhand = bridgeRow.ONHAND; const rawBooked = bridgeRow.BOOKED;
  const onhand = Number(rawOnhand); const booked = Number(rawBooked);
  if (rawOnhand == null || rawOnhand === '' || rawBooked == null || rawBooked === '' || !Number.isSafeInteger(onhand) || !Number.isSafeInteger(booked) || onhand < 0 || booked < 0) fail('Live selling-unit stock is unavailable.');
  const available = onhand - booked;
  const qty = Number(item.qty);
  if (available <= 10 || !Number.isSafeInteger(qty) || qty < metadata.minQty || qty > available) fail('Current available selling units do not support this quantity. Refresh the product.');
  if (!String(bridgeRow.UNITS || '').trim() || normalizeUnitsOfIssue(bridgeRow.UNITS) !== metadata.unitsOfIssue) fail('The canonical POS selling unit changed. Refresh before ordering.');
  if (bridgeRow.website_price_source !== 'positill_website_inclusive' || Number(bridgeRow.website_price_incl_vat) !== metadata.price) fail('The authoritative inclusive website price changed or is unavailable. Refresh before ordering.');
  return metadata;
}
export async function readArchiveInstoreRevision(client) {
  try {
    const { data, error } = await client.rpc('archive_review_catalogue_revision');
    return !error && typeof data === 'string' ? data : null;
  } catch { return null; }
}
export function verifyArchiveInstoreAllocation(items, rows, bridgeByCode) {
  const totals = new Map();
  for (const item of items) {
    const row = rows.find(row => row.sku === String(item.product?.sku || item.product?.id || '').trim().toUpperCase());
    if (!isArchiveInstore(row)) continue;
    const code = String(row.barcode || row.sku).trim().toUpperCase();
    totals.set(code, (totals.get(code) || 0) + Number(item.qty));
  }
  for (const [code, qty] of totals) {
    const row = bridgeByCode.get(code);
    if (qty > Number(row?.ONHAND) - Number(row?.BOOKED)) throw Object.assign(new Error('Combined variant quantities exceed current available selling units.'), { status: 409 });
  }
}
