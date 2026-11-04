// Owner-approved exact supplier families, 4 November 2026. This is an ordering
// policy, never a stock quantity, publication permission or prefix override.
export const SARONGI_REQUEST_SKUS = Object.freeze([
  'KANK3201', 'KBRA2003', 'KBRA2017', 'KBRA2018', 'KBRA2019', 'KBRA3001',
  'KBRA3013', 'KBRA3014', 'KBRA3020', 'KBRA3021', 'KBRA3101', 'KBRA4018',
  'KBRA4019', 'KBRA4027', 'KBRA4028', 'KBRA4304', 'KBRA6001', 'KNEC1004',
  'KNEC1103', 'KNEC2013', 'KNEC3001', 'KNEC3101',
]);
const approved = new Set(SARONGI_REQUEST_SKUS);
export function isSarongiRequestSku(sku) {
  return typeof sku === 'string' && approved.has(sku.trim().toUpperCase());
}
export function isSarongiInstoreRequest(product) {
  if (product?.isExtendedRange !== true) return false;
  const sku = String(product.sku || product.id || '').trim().toUpperCase();
  return isSarongiRequestSku(sku);
}
export function sarongiRequestAvailability(sku, availability) {
  // Keep the existing label and the observed stock. Only orderability changes.
  return isSarongiRequestSku(sku) ? { ...availability, canOrder: true } : availability;
}
export function instoreQuantityLimit(product) {
  if (!product?.isExtendedRange || isSarongiInstoreRequest(product)) return 9999;
  return Math.max(0, Math.floor(Number(product.stockOnHand ?? product.stockQty) || 0));
}
