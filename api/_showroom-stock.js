import { readShowroomLiveStock, showroomSourceCode, overlayShowroomLiveStock } from '../lib/showroom-live-stock.mjs';
import { availabilityForRow } from './_product-availability.js';

// Authoritative listing metadata stays in Website Stock. Only balances are
// observed from the exact read-only Positill source; no sync or receipt writes.
export async function currentShowroomStock(rows, incomingBySku = new Map(), options = {}) {
  const products = rows.map(row => ({
    ...row, code: row.barcode || row.sku, unitsOfIssue: row.units_of_issue,
    stockQty: row.stock_qty, stockOnHand: row.available_stock,
    toOrder: !!row.to_order, availability: availabilityForRow(row, incomingBySku.get(row.sku)),
  }));
  const codes = [...new Set(products.flatMap(product => {
    try { return [showroomSourceCode(product)]; } catch { return []; }
  }))];
  // Orders support 250 lines. Bound each read cohort without rejecting the
  // basket, and share one observation for all website aliases of a source.
  const observations = await (options.readStock || readShowroomLiveStock)(codes, {
    env: options.bridgeEnv, transport: options.fetchBridge, maxCodes: 250,
  });
  return new Map(overlayShowroomLiveStock(products, observations).map(product => [product.sku, product]));
}
