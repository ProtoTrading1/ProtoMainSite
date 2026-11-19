import { resolveProductAvailability } from './product-availability.mjs';

// These five published items have no products mirror row. Read through to
// Positill until that upstream sync is repaired; never write website_stock,
// whose receipt trigger would otherwise remove the incoming-stock markers.
export const FLORAL_LIVE_CODES = Object.freeze(['8626000794', '8626000796', '8626000798', '8626000803', '8626000804']);
export const FLORAL_REFRESH_MS = 30_000;
const codes = new Set(FLORAL_LIVE_CODES);
export const isFloralLiveCode = code => codes.has(String(code || '').trim().toUpperCase());

export async function readFloralLiveStock(code, { fetchBridge = fetch, bridgeEnv = process.env } = {}) {
  if (!isFloralLiveCode(code)) throw new Error('Unsupported live stock code');
  const base = String(bridgeEnv.STOCK_SQL_BRIDGE_URL || '').trim().replace(/\/$/, '');
  const key = String(bridgeEnv.STOCK_SQL_BRIDGE_KEY || '').trim();
  if (!base.startsWith('https://') || !key) throw new Error('Live stock unavailable');
  const response = await fetchBridge(`${base}/stmast`, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify({ sku: code }), signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Live stock unavailable');
  const row = (await response.json())?.row;
  if (typeof row?.CODE !== 'string' || row.CODE.trim().toUpperCase() !== code) throw new Error('Live stock identity mismatch');
  for (const field of ['ONHAND', 'BOOKED']) {
    const value = row[field];
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) throw new Error('Live stock incomplete');
  }
  if (Number(row.BOOKED) < 0) throw new Error('Live stock invalid');
  return { qty: Math.max(0, Math.floor(Number(row.ONHAND) - Number(row.BOOKED))), checkedAt: new Date().toISOString() };
}

export async function applyFloralLiveStock(products, options = {}) {
  const observations = new Map();
  await Promise.all([...new Set(products.map(p => String(p.barcode || p.code || p.sku || '').trim().toUpperCase()).filter(isFloralLiveCode))].map(async code => {
    try { observations.set(code, await readFloralLiveStock(code, options)); }
    catch { observations.set(code, null); }
  }));
  return products.map(product => {
    const code = String(product.barcode || product.code || product.sku || '').trim().toUpperCase();
    if (!observations.has(code)) return product;
    const observation = observations.get(code);
    const qty = observation?.qty ?? null;
    const availability = resolveProductAvailability({ stockQty: qty, toOrder: product.toOrder, incoming: product.availability });
    // Unknown is not a confirmed zero balance. Orders remain requests.
    if (!observation) Object.assign(availability, { state: 'to_order', label: 'Available to order', guidance: 'Live stock check unavailable', canOrder: true });
    return { ...product, stockQty: qty, stockOnHand: qty, inStock: qty !== null && qty > 0, availability, stockSource: observation ? 'live_positill' : 'unavailable', stockCheckedAt: observation?.checkedAt ?? null };
  });
}
