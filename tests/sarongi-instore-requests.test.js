import test from 'node:test';
import assert from 'node:assert/strict';
import { SARONGI_REQUEST_SKUS, isSarongiRequestSku, isSarongiInstoreRequest, instoreQuantityLimit, sarongiRequestAvailability } from '../lib/sarongi-instore-requests.mjs';
import { buildExtendedRangeProducts, excludeMainCatalogueProducts } from '../api/extended-range.js';
import { validateInstoreBridgeStock } from '../api/stock.js';
import { assertArrivedOrderTotals } from '../api/_arrived-stock.js';
import { resolveInstoreOrderLine } from '../api/send-order.js';
import { stockAdvisoryForQty } from '../src/lib/stockAdvisory.js';
import { withPositillObservation } from '../lib/positill-selling-unit.mjs';

const sku = 'KBRA3014';
const row = (code = sku, quantity = 0) => ({ sku: code, title: 'EXISTING TITLE', image_source: 'nutstore', image_url: 'https://example.test/synthetic.png', image_review_status: 'verified', visibility_status: 'search_only', is_active: true, price: 10, available_stock: quantity });
const bridge = (code = sku, quantity = 0) => ({ CODE: code, UNITS: code === sku ? '4PC' : 'EACH', DESCR: 'EXISTING TITLE', PRICE_A: 10, ONHAND: quantity, BOOKED: 0 });
const item = (code = sku, qty = 20, preference = 'Purple') => ({ qty, preference, product: { sku: code, isExtendedRange: true, price: 0.01 } });

test('only the exact 22 matched families receive the request policy', () => {
  assert.equal(new Set(SARONGI_REQUEST_SKUS).size, 22);
  for (const code of ['KANK3101', 'KBEL1001', 'KBRA2014', 'KBRA2015', 'KBRA2016', 'KBRA3005', 'KBRA3012', 'KBRA3019', 'KBRA3102', 'KBRA4010', 'KBRA3014PUR', 'OTHER']) assert.equal(isSarongiRequestSku(code), false);
  assert.equal(isSarongiInstoreRequest({ sku, isExtendedRange: false }), false);
  assert.equal(isSarongiInstoreRequest({ sku, isExtendedRange: true }), true);
});

test('all 22 reviewed, active image-index rows survive discovery at zero, negative, low and unknown stock', () => {
  for (const quantity of [0, -80, 2, 10, null, undefined, '']) {
    const rows = SARONGI_REQUEST_SKUS.map(code => row(code, quantity));
    const products = buildExtendedRangeProducts(rows);
    assert.equal(products.length, 22);
    for (const p of products) {
      assert.equal(p.price, 10);
      assert.equal(p.name, 'EXISTING TITLE');
      assert.equal(p.stockQty, quantity === undefined ? 0 : quantity === null || quantity === '' ? null : quantity);
      assert.equal(p.availability.canOrder, true);
    }
  }
});

test('the policy does not relax ordinary Instore admission or publish unrelated Archive rows', () => {
  assert.equal(buildExtendedRangeProducts([row('OTHER', 0), row('KBRA2014', 0)]).length, 0);
  assert.equal(buildExtendedRangeProducts([row('OTHER', 11)]).length, 1);
  for (const override of [{ is_active: false }, { visibility_status: 'hidden' }, { image_review_status: 'pending' }, { price: 0 }, { image_url: '' }, { listing_control_status: 'hidden' }]) assert.equal(buildExtendedRangeProducts([{ ...row(), ...override }]).length, 0);
  assert.equal(excludeMainCatalogueProducts(buildExtendedRangeProducts([row()]), [{ sku, barcode: '' }]).length, 0);
});

test('live refresh retains actual negative/unknown quantities and existing text, with verified units', () => {
  for (const quantity of [0, -80, 1, 300]) {
    const result = validateInstoreBridgeStock(sku, bridge(sku, quantity));
    assert.equal(result.qty, quantity);
    assert.equal(result.availability.canOrder, true);
    assert.equal(result.unitsOfIssue, '4PC');
    const product = withPositillObservation({ sku, isExtendedRange: true }, result);
    assert.equal(product.stockQty, quantity);
    assert.equal(instoreQuantityLimit(product), 9999);
  }
  const unknown = validateInstoreBridgeStock(sku, { ...bridge(), ONHAND: null });
  assert.equal(unknown.qty, null);
  assert.equal(unknown.availability.canOrder, true);
  assert.throws(() => validateInstoreBridgeStock(sku, { ...bridge(), CODE: 'OTHER' }));
  assert.throws(() => validateInstoreBridgeStock(sku, { ...bridge(), UNITS: '' }));
  assert.throws(() => validateInstoreBridgeStock('OTHER', { ...bridge('OTHER'), ONHAND: null }));
});

test('existing availability copy and real quantities are preserved; only canOrder changes', () => {
  const original = { state: 'out_of_stock', label: 'Out of stock', guidance: 'Existing guidance', stockQty: -3, canOrder: false };
  assert.deepEqual(sarongiRequestAvailability(sku, original), { ...original, canOrder: true });
  assert.equal(original.canOrder, false);
  assert.strictEqual(sarongiRequestAvailability('OTHER', original), original);
});

test('basket and card limits allow supplier requests while ordinary positive/zero caps remain', () => {
  for (const qty of [-3, 0, 1, null]) {
    const product = { sku, stockQty: qty, isExtendedRange: true };
    assert.equal(instoreQuantityLimit(product), 9999);
    assert.equal(stockAdvisoryForQty(product, 40).isOverOrder, false);
  }
  assert.equal(instoreQuantityLimit({ sku: 'OTHER', isExtendedRange: true, stockQty: 2 }), 2);
  assert.equal(instoreQuantityLimit({ sku: 'OTHER', isExtendedRange: true, stockQty: -1 }), 0);
  assert.equal(stockAdvisoryForQty({ sku, isExtendedRange: false, stockQty: 2 }, 40).isOverOrder, true);
});

test('arrival allocation caps are skipped only for the exact supplier scope, including repeated colour lines', () => {
  const records = new Map([[sku, { code: sku, quantity: 2, units: '4PC', status: 'receiving-recorded' }], ['OTHER', { code: 'OTHER', quantity: 2, units: 'EACH', status: 'receiving-recorded' }]]);
  const sources = new Map([[sku, bridge()], ['OTHER', bridge('OTHER', 2)]]);
  const before = structuredClone([...records]);
  assert.equal(assertArrivedOrderTotals([item(sku, 100, 'Purple'), item(sku, 100, 'Orange')], records, sources).size, 0);
  assert.throws(() => assertArrivedOrderTotals([item(sku, 100), item('OTHER', 3)], records, sources), /only 2/);
  assert.deepEqual([...records], before);
});

test('supplier requests retain server price, pack units and colour and still reject removal/tampering', () => {
  for (const code of SARONGI_REQUEST_SKUS) {
    const result = resolveInstoreOrderLine(item(code), { indexRow: row(code), bridgeRow: bridge(code, -30) });
    assert.equal(result.qty, 20);
    assert.equal(result.preference, 'Purple');
    assert.equal(result.product.price, 11.5);
    assert.equal(result.product.unitsOfIssue, code === sku ? '4PC' : 'EACH');
  }
  for (const input of [{ ...item(), qty: 0 }, { ...item(), qty: 1.5 }, { ...item(), qty: 100001 }]) assert.throws(() => resolveInstoreOrderLine(input, { indexRow: row(), bridgeRow: bridge() }));
  assert.throws(() => resolveInstoreOrderLine(item(), { indexRow: row(), bridgeRow: bridge(), listingStatus: 'hidden' }));
  assert.throws(() => resolveInstoreOrderLine(item(), { indexRow: row('OTHER'), bridgeRow: bridge() }));
  assert.throws(() => resolveInstoreOrderLine(item(), { indexRow: row(), bridgeRow: bridge(), normalRows: [{ sku }] }));
});
