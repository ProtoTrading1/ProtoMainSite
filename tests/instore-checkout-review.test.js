import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { websitePriceFromExVat } from '../lib/catalogue-price.mjs';
import { itemPreferenceFields } from '../lib/item-preference.mjs';
import { evaluateCheckoutSnapshot, normaliseStockQty } from '../lib/order-stock-guard.mjs';
import { evaluateInstoreDuplicate } from '../lib/instore-duplicate-gate.mjs';

// Execute actual resolver bodies with inert index/bridge dependencies. No real
// environment, database, credentials or network are read by this harness.
const source = readFileSync(new URL('../api/send-order.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const end = source.slice(start).search(/\r?\n}/);
  assert.ok(end >= 0, name);
  return source.slice(start, start + end).replace(/^export /, '') + '\n}';
}
const sku = 'SYNTHETIC-INSTORE';
const indexRow = { sku, image_source: 'nutstore', title: 'Synthetic item', image_review_status: 'verified', visibility_status: 'search_only', is_active: true };
const bridge = { CODE: sku, DESCR: 'Synthetic item', PRICE_A: 11.74, ONHAND: 12, BOOKED: 1 };
const line = (qty = 2, snapshot = { unitPrice: 13.5, stockQty: 11 }, preference = 'Blue') => ({ qty, preference,
  product: { sku, id: sku, isExtendedRange: true, price: .01, toOrder: true, checkoutSnapshot: snapshot } });
function fixture({ bridgeRow = bridge, index = indexRow, normal = [], hidden = false } = {}) {
  const context = vm.createContext({ websitePriceFromExVat, itemPreferenceFields, evaluateCheckoutSnapshot,
    normaliseStockQty, evaluateInstoreDuplicate, MAX_QTY_PER_LINE: 100000, MIN_INSTORE_AVAILABLE_STOCK: 10,
    cleanText: (value, fallback = '') => String(value || fallback), console: { error() {} },
    process: { env: { STOCK_SQL_BRIDGE_URL: 'https://synthetic.invalid', STOCK_SQL_BRIDGE_KEY: 'inert' } },
    AbortSignal: { timeout() { return undefined; } },
    fetch: async () => ({ ok: true, json: async () => ({ row: bridgeRow }) }),
    stockClient: () => ({ from(table) { return { select() { return this; }, in() { return this; },
      then(resolve) { return Promise.resolve({ error: null, data: table === 'extended_range_items' ? [index]
        : table === 'website_stock' ? normal : hidden ? [{ sku, status: 'hidden' }] : [] }).then(resolve); } }; } }),
  });
  vm.runInContext(['orderError', 'textId', 'availableFromBridge', 'instoreReviewRequired',
    'resolveInstoreOrderLine', 'resolveInstorePrices'].map(extract).join('\n'), context);
  return context;
}
async function review(items, options) {
  let error;
  try { await fixture(options).resolveInstorePrices(items); } catch (caught) { error = caught; }
  assert.equal(error?.status, 409);
  assert.equal(error?.code, 'ORDER_REVIEW_REQUIRED');
  return error.changes;
}
test('unchanged Instore snapshot resolves authoritative price and preserves preference', async () => {
  const result = await fixture().resolveInstorePrices([line()]);
  assert.equal(result[0].product.price, 13.5);
  assert.equal(result[0].preference, 'Blue');
});
test('changed Instore reviewed price requires explicit review', async () => {
  const changes = await review([line(2, { unitPrice: 1, stockQty: 11 })]);
  assert.equal(changes[0].priceChanged, true);
  assert.equal(changes[0].currentPrice, 13.5);
});
test('changed stock requires review even when requested quantity remains available', async () => {
  const changes = await review([line(2, { unitPrice: 13.5, stockQty: 15 })]);
  assert.equal(changes[0].stockChanged, true);
  assert.equal(changes[0].quantityExceedsStock, false);
});
test('preference lines share physical stock and report aggregate requested quantity', async () => {
  const changes = await review([line(6), line(6, undefined, 'Red')]);
  assert.equal(changes[0].requestedQty, 12);
  assert.equal(changes[0].quantityExceedsStock, true);
});
test('price and stock review entries carry aggregate shortage consistently', async () => {
  const changes = await review([line(6, { unitPrice: 1, stockQty: 15 }), line(6, undefined, 'Red')]);
  assert.ok(changes.every(change => change.requestedQty === 12 && change.quantityExceedsStock));
});
test('missing snapshots cannot silently consent and unknown stock cannot capture', async () => {
  assert.ok((await review([line(2, {})]))[0].priceChanged);
  assert.ok((await review([line()], { bridgeRow: { ...bridge, BOOKED: null } }))[0].stockUnavailable);
});
test('review cannot bypass hidden, inactive or duplicate Main listing gates', async () => {
  for (const options of [{ hidden: true }, { index: { ...indexRow, is_active: false } }, { normal: [{ sku }] }]) {
    await assert.rejects(fixture(options).resolveInstorePrices([line(2, {})]), error => error.status === 409 && error.code !== 'ORDER_REVIEW_REQUIRED');
  }
});
test('unchanged snapshot below existing ten-unit eligibility threshold stays blocked', async () => {
  await assert.rejects(fixture({ bridgeRow: { ...bridge, ONHAND: 10 } }).resolveInstorePrices([
    line(2, { unitPrice: 13.5, stockQty: 9 }),
  ]), error => error.status === 409 && error.code !== 'ORDER_REVIEW_REQUIRED');
});
