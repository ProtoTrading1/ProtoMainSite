import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { captureOrderRow, resolveInstoreOrderLine } from '../api/send-order.js';
import { verifiedReorderProduct, cartProductsNeedReview, knownCartProductSource } from '../src/lib/cartProductRecovery.mjs';
import { addBasketLine, mergeBasketLines } from '../lib/basket-lines.mjs';
import { itemPreferenceFields } from '../lib/item-preference.mjs';
import { isToOrderProduct, evaluateCheckoutSnapshot, normaliseStockQty } from '../lib/order-stock-guard.mjs';
import { withDeadline } from '../src/lib/requestDeadline.mjs';
import { availabilityForRow } from '../api/_product-availability.js';
import { customerFacingCataloguePrice } from '../lib/catalogue-price.mjs';
import { normalizeUnitsOfIssue, sellingUnitDetails } from '../lib/selling-unit.mjs';
import { parseCartMutation, cartPayload } from '../api/account-cart.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const source = read('api/send-order.js');
const owner = 'synthetic-owner';
const main = { sku: 'MAIN-EXACT', barcode: 'BARCODE-EXACT', title: 'Synthetic Main', price: 100,
  stock_qty: 10, available_stock: 10, to_order: false, min_order_qty: 1, units_of_issue: 'EACH' };

async function resolveMain(row = main, submittedItems = null) {
  const code = source.slice(source.indexOf('async function resolveStandardPrices('), source.indexOf('export async function resolveAuthoritativePrices('));
  const query = { select() { return this; }, async in() { return { data: Array.isArray(row) ? row : [row], error: null }; } };
  const resolve = runInNewContext(`(${code.trim()})`, { getStockClient: () => ({ from: () => query }),
    loadIncomingAvailabilityMap: async () => new Map(), availabilityForRow, customerFacingCataloguePrice,
    isToOrderProduct, evaluateCheckoutSnapshot, normaliseStockQty, normalizeUnitsOfIssue, sellingUnitDetails, itemPreferenceFields,
    MAX_QTY_PER_LINE: 9999, MAX_ORDER_LINES: 250, cleanText: value => String(value ?? '').trim(), textId: value => String(value ?? '').trim().toUpperCase(),
  });
  const resolved = await resolve(submittedItems || [{ qty: 3, preference: 'Blue', product: { id: row.sku, sku: row.sku, code: row.barcode,
    checkoutSnapshot: { unitPrice: 100, stockQty: 10 } } }]);
  return submittedItems ? resolved : resolved[0];
}

async function captureAndRead(items) {
  let inserted;
  // A local in-memory DB adapter records the actual capture projection. No
  // SQL, provider or external network operation is executed.
  const writer = { from: () => ({ insert(rows) { inserted = rows[0]; return { select: () => ({ single: async () => ({
    data: { id: 'synthetic-order', ...inserted }, error: null,
  }) }) }; } }) };
  await captureOrderRow({ supabase: writer, userId: owner, items, subtotal: 300, deliveryMethod: 'In store pick up',
    requestHash: 'synthetic-immutable-hash', notificationSnapshot: { version: 1, items } });
  const identity = { userId: owner };
  const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    maybeSingle() { return this; }, abortSignal() { return Promise.resolve({ data: { id: 'synthetic-order', ...inserted }, error: null }); } };
  const orders = read('src/lib/orders.js').replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const context = { supabase: { from: () => query }, captureAuthIdentity: () => identity,
    assertAuthIdentity: actual => assert.equal(actual, identity), withDeadline, AbortController };
  runInNewContext(orders + '\nglobalThis.reader = createCustomerOrderReader();', context);
  return context.reader.fetchLastOrder(owner);
}

async function reorder(rows, fresh) {
  const code = read('src/App.jsx').match(/const handleReorder = ([\s\S]*?\r?\n {2}});/)[1];
  const identity = { userId: owner }; const currentCartRef = { current: { items: [], activityAt: null } };
  const handler = runInNewContext(`(${code})`, { captureAuthIdentity: () => identity, customer: { id: owner },
    cartAccountRef: { current: owner }, cartHydratedRef: { current: true }, canChangeBasket: () => true,
    flushSync: callback => callback(), currentCartRef, cartRevisionRef: { current: 1 },
    pendingJournalRef: { current: { raw: null } }, pendingCheckoutRef: { current: null }, lastCheckoutOptionsRef: { current: null },
    cartConflictRef: { current: false }, cartSyncInFlightRef: { current: false },
    fetchProductsBySkus: async () => new Map([[fresh.id, fresh]]),
    fetchInstoreProductsBySkus: async () => new Map([[fresh.id, fresh]]), catalogProducts: [],
    verifiedReorderProduct, knownCartProductSource, mergeBasketLines, addBasketLine, itemPreferenceFields, MAX_CART_LINES: 250,
    cartQtyCapForProduct: product => isToOrderProduct(product) ? 9999 : product.stockQty,
    setCartItems: update => { currentCartRef.current.items = update(currentCartRef.current.items); },
    markCartActivity() {}, setReorderModal() {},
  });
  return { result: await handler(rows), items: currentCartRef.current.items };
}

test('actual Main resolver→capture→customer history→App reorder preserves verified provenance and quantity', async () => {
  const resolved = await resolveMain(); assert.equal(resolved.product.source, 'main'); assert.equal(resolved.product.isExtendedRange, false);
  const history = await captureAndRead([resolved]);
  assert.equal(history.items[0].source, 'main'); assert.equal(history.items[0].isExtendedRange, false);
  assert.equal(history.items[0].qty, 3); assert.equal(history.items[0].preference, 'Blue');
  const fresh = { ...resolved.product, stockQty: 10 };
  const outcome = await reorder(history.items, fresh); assert.equal(outcome.result.added, 1);
  assert.equal(outcome.items[0].qty, 3); assert.equal(outcome.items[0].preference, 'Blue'); assert.equal(cartProductsNeedReview(outcome.items), false);
});

test('actual Instore resolver→capture→history preserves origin without blessing a Main SKU collision', async () => {
  const resolved = resolveInstoreOrderLine({ qty: 3, product: { sku: 'INSTORE-EXACT', checkoutSnapshot: { unitPrice: 115, stockQty: 10 } } }, {
    indexRow: { sku: 'INSTORE-EXACT', image_source: 'nutstore', is_active: true, image_review_status: 'verified', visibility_status: 'search_only' },
    bridgeRow: { CODE: 'INSTORE-EXACT', ONHAND: 10, BOOKED: 0, PRICE_A: 100 },
  });
  const history = await captureAndRead([resolved]); assert.equal(history.items[0].source, 'instore'); assert.equal(history.items[0].isExtendedRange, true);
  assert.ok(verifiedReorderProduct(history.items[0], resolved.product, 'instore'));
  assert.equal(verifiedReorderProduct(history.items[0], { ...resolved.product, source: 'main', isExtendedRange: false }, 'main'), null);
  const outcome = await reorder(history.items, { ...resolved.product, stockQty: 10 }); assert.equal(outcome.result.added, 1);
  assert.equal(outcome.items[0].product.source, 'instore'); assert.equal(outcome.items[0].qty, 3);
});

test('unknown and contradictory captured hints remain unresolved; no historical source inference', async () => {
  for (const hints of [{}, { source: 'main', isExtendedRange: true }]) {
    const product = { id: 'UNKNOWN', sku: 'UNKNOWN', code: 'UNKNOWN', price: 100, ...hints };
    const history = await captureAndRead([{ qty: 3, product }]);
    assert.equal(Object.hasOwn(history.items[0], 'source'), false); assert.equal(Object.hasOwn(history.items[0], 'isExtendedRange'), false);
    assert.equal(verifiedReorderProduct(history.items[0], { ...product, source: 'main', isExtendedRange: false }, 'main'), null);
  }
});

test('genuine Main ToOrder flag survives capture/history and fresh reorder at zero physical stock', async () => {
  const resolved = await resolveMain({ ...main, to_order: true, available_stock: 0, stock_qty: 0 });
  assert.equal(isToOrderProduct(resolved.product), true);
  const history = await captureAndRead([resolved]); assert.equal(history.items[0].toOrder, true);
  const outcome = await reorder(history.items, { ...resolved.product, stockQty: 0 });
  assert.equal(outcome.result.added, 1); assert.equal(outcome.items[0].qty, 3);
  assert.equal(isToOrderProduct(outcome.items[0].product), true);
});

test('positive Stock Available remains the verified ceiling when POS stock is zero', async () => {
  const resolved = await resolveMain({ ...main, stock_qty: 0, available_stock: 10 });
  assert.equal(resolved.product.toOrder, false, 'positive availability never manufactures a backorder exception');
  const fresh = { ...resolved.product, stockOnHand: 10, stockQty: 0 };
  const mutation = parseCartMutation({ mode: 'save', revision: 0, activityAt: Date.now(), items: [{ qty: 3, product: fresh }] });
  const restored = cartPayload({ items: mutation.items, revision: 1, activity_at: mutation.activityAt });
  const app = read('src/App.jsx');
  const code = app.slice(app.indexOf('function productStockQtyForCart('), app.indexOf('function normalizeCartQtyInput('));
  const context = { isToOrderProduct, normaliseStockQty, CART_QTY_UNLIMITED: 9999 };
  runInNewContext(code + '\nglobalThis.cap = cartQtyCapForProduct;', context);
  assert.equal(context.cap(restored.items[0].product), 10); assert.equal(restored.items[0].qty, 3);
  assert.equal(restored.items[0].product.source, 'main'); assert.equal(restored.items[0].product.isExtendedRange, false);
});

const variantLine = (row, qty, preference) => ({ qty, preference, product: { id: row.sku, sku: row.sku, code: row.barcode,
  checkoutSnapshot: { unitPrice: row.price, stockQty: row.available_stock } } });

test('actual Main resolver rejects 6+6 ordinary variants sharing the physical barcode stock of 10', async () => {
  const variants = [{ ...main, sku: 'VARIANT-RED' }, { ...main, sku: 'VARIANT-BLUE', price: 125 }];
  await assert.rejects(resolveMain(variants, variants.map((row, index) => variantLine(row, 6, index ? 'Blue' : 'Red'))), error => {
    assert.equal(error.code, 'ORDER_REVIEW_REQUIRED');
    assert.deepEqual(Array.from(error.changes, change => change.sku).sort(), ['VARIANT-BLUE', 'VARIANT-RED']);
    for (const change of error.changes) { assert.equal(change.requestedQty, 12); assert.equal(change.currentStockQty, 10); assert.equal(change.quantityExceedsStock, true); }
    return true;
  });
});

test('shared physical cap retains distinct variants, authoritative prices and preferences when sum fits', async () => {
  const variants = [{ ...main, sku: 'VARIANT-RED' }, { ...main, sku: 'VARIANT-BLUE', price: 125 }];
  const resolved = await resolveMain(variants, [variantLine(variants[0], 4, 'Red'), variantLine(variants[1], 6, 'Blue')]);
  assert.deepEqual(Array.from(resolved, line => [line.product.sku, line.product.price, line.qty, line.preference]),
    [['VARIANT-RED', 100, 4, 'Red'], ['VARIANT-BLUE', 125, 6, 'Blue']]);
});

test('mixed genuine ToOrder and ordinary variants cannot lend a backorder exception to ordinary stock', async () => {
  const variants = [{ ...main, sku: 'BACKORDER', to_order: true, available_stock: 0 }, { ...main, sku: 'ORDINARY' }];
  const resolved = await resolveMain(variants, [variantLine(variants[0], 100, 'Sourced'), variantLine(variants[1], 10, 'Available')]);
  assert.equal(resolved[0].qty, 100); assert.equal(resolved[0].product.toOrder, true); assert.equal(resolved[1].qty, 10);
  for (const rows of [variants, [...variants].reverse()]) {
    await assert.rejects(resolveMain(rows, rows.map(row => variantLine(row, row.to_order ? 100 : 11, row.sku))), error => {
      assert.equal(error.code, 'ORDER_REVIEW_REQUIRED'); assert.equal(error.changes.some(change => change.sku === 'ORDINARY' && change.quantityExceedsStock), true);
      assert.equal(error.changes.some(change => change.sku === 'BACKORDER' && change.quantityExceedsStock), false); return true;
    });
  }
});

test('different physical barcodes remain independent and absent barcode falls back to verified SKU', async () => {
  const rows = [{ ...main, sku: 'INDEPENDENT-A', barcode: 'PHYSICAL-A' }, { ...main, sku: 'INDEPENDENT-B', barcode: 'PHYSICAL-B' },
    { ...main, sku: 'NO-BARCODE', barcode: '' }];
  const resolved = await resolveMain(rows, rows.map(row => variantLine(row, 10, row.sku))); assert.equal(resolved.length, 3);
  await assert.rejects(resolveMain(rows, [variantLine(rows[2], 6, 'One'), variantLine(rows[2], 6, 'Two')]), error => error.code === 'ORDER_REVIEW_REQUIRED');
});

test('shared variants hold against each fresh ceiling including lower or unknown availability', async () => {
  for (const ceiling of [7, null]) {
    const rows = [{ ...main, sku: 'HIGH' }, { ...main, sku: 'LOW', available_stock: ceiling, stock_qty: ceiling }];
    const submitted = rows.map(row => ({ ...variantLine(row, 4, row.sku), product: { ...variantLine(row, 4).product,
      checkoutSnapshot: { unitPrice: row.price, stockQty: ceiling === null ? 10 : row.available_stock } } }));
    await assert.rejects(resolveMain(rows, submitted), error => {
      assert.equal(error.code, 'ORDER_REVIEW_REQUIRED'); assert.equal(error.changes.some(change => change.sku === 'LOW' && change.quantityExceedsStock), true); return true;
    });
  }
});

test('unknown SKU with ambiguous legacy barcode cannot pick an arbitrary differently priced variant', async () => {
  const rows = [{ ...main, sku: 'VARIANT-FIRST' }, { ...main, sku: 'VARIANT-LAST', price: 125, available_stock: 7 }];
  const item = variantLine(rows[1], 3, 'Historical preference'); item.product.id = 'UNKNOWN'; item.product.sku = 'UNKNOWN';
  await assert.rejects(resolveMain(rows, [item]), error => {
    assert.equal(error.status, 409); assert.equal(error.code, 'ORDER_PRODUCT_AMBIGUOUS'); return true;
  });
});

test('exact verified variant SKU wins even when its barcode is shared and row order changes', async () => {
  const rows = [{ ...main, sku: 'VARIANT-FIRST' }, { ...main, sku: 'VARIANT-LAST', price: 125, available_stock: 7 }];
  const item = variantLine(rows[0], 3, 'Exact first');
  for (const ordered of [rows, [...rows].reverse()]) {
    const resolved = await resolveMain(ordered, [item]);
    assert.equal(resolved[0].product.sku, 'VARIANT-FIRST'); assert.equal(resolved[0].product.price, 100);
    assert.equal(resolved[0].qty, 3); assert.equal(resolved[0].preference, 'Exact first');
  }
});

test('single authoritative barcode fallback remains compatible without losing variant price or source', async () => {
  const row = { ...main, sku: 'ONLY-VARIANT', price: 125, available_stock: 7 };
  const item = variantLine(row, 3, 'Legacy single'); item.product.id = 'LEGACY-ID'; item.product.sku = 'LEGACY-ID';
  const resolved = await resolveMain([row], [item]);
  assert.equal(resolved[0].product.sku, 'ONLY-VARIANT'); assert.equal(resolved[0].product.price, 125);
  assert.equal(resolved[0].product.source, 'main'); assert.equal(resolved[0].qty, 3); assert.equal(resolved[0].preference, 'Legacy single');
});
