// Isolated integration candidate. No writes and no implicit network access.
// Callers must supply a complete, verified website-only index explicitly.
const key = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');

export function mergeWebsiteOnlyIndex(existingRows, extraRows) {
  if (!Array.isArray(existingRows) || !Array.isArray(extraRows)) throw new Error('Incomplete Instore index');
  const seen = new Set();
  for (const row of existingRows) for (const id of [row?.sku,row?.barcode]) if (key(id)) seen.add(key(id));
  const newKeys = new Set();
  for (const row of extraRows) {
    const sku = key(row?.sku), barcode = key(row?.barcode);
    if (!sku || !barcode || sku !== barcode || seen.has(sku) || newKeys.has(sku)) throw new Error('Website-only index collision');
    if (row.is_active !== true || row.visibility_status !== 'search_only' || row.image_review_status !== 'verified'
        || row.image_source !== 'nutstore' || !String(row.image_url||'').startsWith('https://')
        || !Number.isFinite(Number(row.price)) || Number(row.price) <= 0
        || row.available_stock == null || !Number.isFinite(Number(row.available_stock))) throw new Error('Invalid website-only index row');
    newKeys.add(sku);
  }
  return [...existingRows,...extraRows];
}
