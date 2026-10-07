import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveAuthoritativePrices, resolveInstoreOrderLine } from '../api/send-order.js';

const item = { qty: 2, preference: 'Dark brown if available', product: { id: '8618100133', sku: '8618100133', isExtendedRange: true, price: 0.01 } };
const indexRow = { sku: '8618100133', image_source: 'nutstore', barcode: '', title: 'BRACELET WOODEN BEADS', image_url: 'https://images.example.test/a.jpg', image_review_status: 'verified', visibility_status: 'search_only', is_active: true, price: 11.74 };
const bridgeRow = { CODE: '8618100133', DESCR: 'BRACELET WOODEN BEADS', PRICE_A: 11.74, ONHAND: 12, BOOKED: 1 };

test('Instore checkout rejects missing SKU identities before any stock lookup', async () => {
  await assert.rejects(() => resolveAuthoritativePrices([
    { ...item, product: { isExtendedRange: true } },
  ]), /needs a product code/);
});

test('Instore checkout no longer gates on live stock: the bridge is best-effort', async () => {
  const source = await readFile(new URL('../api/send-order.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /requested > available/);
  assert.doesNotMatch(source, /unavailable in the requested quantity/);
  assert.match(source, /bridge is best-effort/);
  assert.doesNotMatch(source, /Duplicate or invalid Instore order lines/);
});

test('Instore checkout ignores the browser price and uses the fresh bridge price', () => {
  const result = resolveInstoreOrderLine(item, { indexRow, bridgeRow });
  assert.equal(result.product.price, 13.5);
  assert.equal(result.preference, 'Dark brown if available');
  assert.equal(result.product.minQty, 1);
});

test('Instore checkout accepts a request beyond live stock, below the display threshold, or with unreadable stock', () => {
  assert.equal(resolveInstoreOrderLine({ ...item, qty: 12 }, { indexRow, bridgeRow }).qty, 12);
  assert.equal(resolveInstoreOrderLine(item, { indexRow, bridgeRow: { ...bridgeRow, ONHAND: 3, BOOKED: 0 } }).product.price, 13.5);
  assert.equal(resolveInstoreOrderLine(item, { indexRow, bridgeRow: { ...bridgeRow, ONHAND: 0, BOOKED: 0 } }).product.sku, indexRow.sku);
  assert.equal(resolveInstoreOrderLine(item, { indexRow, bridgeRow: { ...bridgeRow, BOOKED: null } }).product.price, 13.5);
});

test('Instore checkout falls back to the reviewed index price when Positill has no row', () => {
  const result = resolveInstoreOrderLine(item, { indexRow, bridgeRow: undefined });
  assert.equal(result.product.price, 13.5);
  assert.equal(result.product.name, 'BRACELET WOODEN BEADS');
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow: { ...indexRow, price: 0 }, bridgeRow: undefined }), { status: 409, message: /no current Instore price/ });
});

test('Instore checkout remains available while an incorrect customer image is hidden', () => {
  const result = resolveInstoreOrderLine(item, { indexRow: { ...indexRow, image_url: '' }, bridgeRow });
  assert.equal(result.product.sku, indexRow.sku);
  assert.equal(result.product.price, 13.5);
});

test('Instore checkout rejects a SKU explicitly removed from Instore Products', () => {
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow, bridgeRow, listingStatus: 'hidden' }), { status: 409 });
});

test('Instore checkout still rejects inactive, unverified-image and duplicate-main records', () => {
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow: { ...indexRow, is_active: false }, bridgeRow }), { status: 409 });
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow: { ...indexRow, image_review_status: 'pending' }, bridgeRow }), { status: 409 });
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow, bridgeRow, normalRows: [{ sku: '8618100133' }] }), { status: 409 });
});

test('Preview cannot create a real order, while production retains the same resolver', async () => {
  const source = await readFile(new URL('../api/send-order.js', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(source, /Ordering is disabled in Preview/);
});
