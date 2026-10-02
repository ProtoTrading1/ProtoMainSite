import { analyticsSessionId } from './analyticsSession.js';
const searches = new Map();
const productSearches = new Map();
const productKey = product => `${shoppingSource(product)}:${product?.code || product?.sku || product?.id}`;
export function shoppingSource(product) { return product?.isExtendedRange === true ? 'instore' : 'main'; }
export function activeShoppingSearch(source) { return searches.get(source) || null; }
export function clearShoppingSearch(source) {
  searches.delete(source);
  for (const [key, origin] of productSearches) if (origin.source === source) productSearches.delete(key);
}
/** Append-only telemetry; authentication, exclusions and timestamps are server-owned. */
export function trackShoppingEvent(eventType, fields = {}) {
  let eventId; let sessionId;
  try { eventId = crypto.randomUUID(); sessionId = analyticsSessionId(); } catch { return null; }
  const payload = { ...fields, eventType, eventId, sessionId };
  Promise.resolve().then(async () => {
    const { authHeaders } = await import('./authHeaders');
    await fetch('/api/shopping-events', { method: 'POST', headers: await authHeaders(), keepalive: true, body: JSON.stringify(payload) });
  }).catch(() => {});
  return eventId;
}
export function trackShoppingSearch(fields) {
  const id = trackShoppingEvent('search_results_viewed', fields);
  searches.set(fields.source, id);
  return id;
}
export function shoppingProductSearch(product) {
  const origin = productSearches.get(productKey(product));
  if (origin && activeShoppingSearch(origin.source) === origin.id) return origin.id;
  return activeShoppingSearch(shoppingSource(product));
}
export function trackShoppingProduct(eventType, product, { searchSource, ...fields } = {}) {
  const source = shoppingSource(product);
  const originSource = searchSource || source;
  if (eventType === 'search_result_clicked') {
    const id = fields.searchId || activeShoppingSearch(originSource);
    if (id) productSearches.set(productKey(product), { source: originSource, id });
    else productSearches.delete(productKey(product));
  }
  return trackShoppingEvent(eventType, { source, productId: String(product?.code || product?.sku || product?.id || '').slice(0, 128), searchId: shoppingProductSearch(product), ...fields });
}
export function basketQuantityChanges(previous, current) {
  const aggregate = (items) => {
    const rows = new Map();
    for (const item of items) {
      const key = `${shoppingSource(item.product)}:${item.product.id}`;
      const entry = rows.get(key) || { product: item.product, quantity: 0 };
      entry.quantity += Number(item.qty) || 0; rows.set(key, entry);
    }
    return rows;
  };
  const before = aggregate(previous); const after = aggregate(current); const changes = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(key)?.quantity || 0; const next = after.get(key)?.quantity || 0;
    if (old === next) continue;
    changes.push({ eventType: next > old ? 'basket_item_added' : next === 0 ? 'basket_item_removed' : 'basket_quantity_changed', product: (after.get(key) || before.get(key)).product, quantity: next > old ? next - old : old - next });
  }
  return changes;
}

const viewedPreviews = new Set();
export function trackShoppingPreview(product) {
  const key = `${shoppingSource(product)}:${product?.id}`;
  if (viewedPreviews.has(key)) return;
  viewedPreviews.add(key);
  trackShoppingProduct('product_viewed', product);
}
export function closeShoppingPreview(product) { viewedPreviews.delete(`${shoppingSource(product)}:${product?.id}`); }
export function releaseUnmountedPreview(product) {
  window.setTimeout(() => { if (!document.querySelector('.pz-modal')) closeShoppingPreview(product); }, 100);
}

const catalogueVisits = new Set();
export function trackCatalogueVisit(customerId, source, metadata = {}) {
  if (!customerId) return;
  const key = `proto_analytics_catalogue_visit_v1:${analyticsSessionId()}:${customerId}:${source}`;
  try { if (sessionStorage.getItem(key)) return; } catch { /* memory fallback */ }
  if (catalogueVisits.has(key)) return;
  catalogueVisits.add(key);
  try { sessionStorage.setItem(key, '1'); } catch { /* memory fallback */ }
  trackShoppingEvent('catalogue_viewed', { source, metadata });
}
