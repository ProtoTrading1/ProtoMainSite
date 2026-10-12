import { normalizeUnitsOfIssue } from '../lib/selling-unit.mjs';
import { customerFacingCataloguePrice } from '../lib/catalogue-price.mjs';

export const ARCHIVE_MAIN_MARKER = 'archive_review_request_id';
export function isArchiveMain(row) {
  return row?.[ARCHIVE_MAIN_MARKER] != null;
}
export function archiveMainMetadata(row) {
  if (!isArchiveMain(row)) return null;
  const metadata = row.archive_review_main;
  const marker = row[ARCHIVE_MAIN_MARKER];
  const price = Number(metadata?.price);
  const unit = metadata?.units_of_issue;
  const minimum = Number(metadata?.min_order_qty);
  if (typeof marker !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(marker)
    || metadata?.requestId !== marker || metadata?.sku !== row.sku || metadata?.destination !== 'main'
    || metadata?.price_source !== 'positill_website_inclusive' || !Number.isFinite(price) || price <= 0 || Number(row.price) !== price
    || typeof unit !== 'string' || !unit.trim() || /^(?:UNKNOWN|N\/?A|0|[-—])$/i.test(unit)
    || normalizeUnitsOfIssue(unit) !== unit || row.units_of_issue !== unit
    || !Number.isSafeInteger(minimum) || minimum < 1 || Number(row.min_order_qty) !== minimum
    || metadata?.barcode !== row.barcode) return null;
  return { price, unitsOfIssue: unit, minQty: minimum };
}
export async function attachArchiveMainMetadata(client, rows) {
  const skus = [...new Set(rows.filter(isArchiveMain).map(row => row.sku))];
  if (!skus.length) return rows;
  const metadata = new Map();
  for (let start = 0; start < skus.length; start += 500) {
    try {
      const { data, error } = await client.rpc('archive_review_main_metadata', { p_skus: skus.slice(start, start + 500) });
      if (!error && Array.isArray(data)) for (const row of data) metadata.set(row.sku, row);
    } catch { /* Marked rows stay held when their contract is unavailable. */ }
  }
  return rows.map(row => isArchiveMain(row) ? { ...row, archive_review_main: metadata.get(row.sku) || null } : row);
}
export function archiveMainPrice(row) {
  if (!isArchiveMain(row)) return customerFacingCataloguePrice(row.price);
  const metadata = archiveMainMetadata(row);
  if (!metadata) throw Object.assign(new Error('Archive-routed Main price or selling unit is unverified. Refresh before ordering.'), { status: 409 });
  return metadata.price;
}
function missingMarker(error) {
  return ['42703', 'PGRST204'].includes(error?.code)
    && String(error.message || '').includes(ARCHIVE_MAIN_MARKER)
    && /(?:does not exist|could not find|not found)/i.test(String(error.message || ''));
}
// Only a verified missing marker column permits legacy-schema fallback.
export async function selectArchiveMainRows(client, columns, build) {
  const execute = selection => build(client.from('website_stock').select(selection));
  let result = await execute(columns + ', ' + ARCHIVE_MAIN_MARKER);
  if (missingMarker(result.error)) result = await execute(columns);
  if (result.error) throw result.error;
  return { ...result, data: await attachArchiveMainMetadata(client, result.data || []) };
}
export async function readArchiveMainRevision(client) {
  try {
    const { data, error } = await client.rpc('archive_review_main_revision');
    return !error && typeof data === 'string' ? data : 'main-contract-unavailable';
  } catch { return 'main-contract-unavailable'; }
}
