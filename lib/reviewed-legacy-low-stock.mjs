// Two existing Owner-approved legacy listings. This does not publish products,
// alter stock, change request limits or grant other local-folder imports a bypass.
const reviewed = new Map([
  ['8630000031', '84f3f379-ec8f-409e-8a48-2092d6dfc35a'],
  ['8781830027', '985408ab-8190-4c2c-bc51-0ca3b218bef6'],
]);
const observation = Symbol('reviewed legacy live stock');

function matchingListing(row) {
  const sku = row?.sku;
  const photo = reviewed.get(sku);
  return Boolean(photo && row.barcode === sku && row.supplier_name === 'POSITILL'
    && row.image_source === 'nutstore' && row.image_review_status === 'verified'
    && row.visibility_status === 'search_only' && row.is_active === true
    && row.minimum_stock === 1 && row.image_source_key === `local-folder-live:${sku}.jpg`
    && row.image_url === `https://yiqsvwajozafvalwcero.supabase.co/storage/v1/object/public/product-images/instore/${sku}/${photo}.jpg`);
}

// The marker is process-local and cannot come from a persisted row or browser.
// Object spreads in the normal controls/merge pipeline preserve the symbol;
// JSON caches never preserve it. Only a fresh received-stock read may mark a row.
export function confirmReviewedLegacyStock(row, current, arrival) {
  if (matchingListing(row) && arrival?.status === 'receiving-recorded'
    && arrival.code === row.sku && current?.unitsOfIssue === 'EACH'
    && Number.isSafeInteger(current.qty) && current.qty > 0) row[observation] = current.qty;
}

export function reviewedLegacyLowStockEligible(row) {
  return matchingListing(row) && Number.isSafeInteger(row.available_stock)
    && row.available_stock > 0 && row[observation] === row.available_stock;
}
