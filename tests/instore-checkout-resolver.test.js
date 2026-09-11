import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveAuthoritativePrices, resolveInstoreOrderLine } from '../api/send-order.js';

const item = { qty: 2, preference: 'Dark brown if available', product: { id: '8618100133', sku: '8618100133', isExtendedRange: true, price: 0.01 } };
const indexRow = { sku: '8618100133', image_source: 'nutstore', barcode: '', title: 'BRACELET WOODEN BEADS', image_url: 'https://images.example.test/a.jpg', image_review_status: 'verified', visibility_status: 'search_only', is_active: true };
const bridgeRow = { CODE: '8618100133', DESCR: 'BRACELET WOODEN BEADS', PRICE_A: 11.74, ONHAND: 12, BOOKED: 1 };

test('Instore checkout rejects duplicate normalized SKUs before any stock lookup', async () => {
  await assert.rejects(() => resolveAuthoritativePrices([
    { ...item, qty: 10 },
    { ...item, qty: 10, product: { ...item.product, sku: ' 8618100133 ' } },
  ]), /Duplicate or invalid Instore order lines/);
});

test('Instore checkout rejects missing SKU identities before any stock lookup', async () => {
  await assert.rejects(() => resolveAuthoritativePrices([
    { ...item, product: { isExtendedRange: true } },
  ]), /Duplicate or invalid Instore order lines/);
});

test('Instore checkout ignores browser price and caps the request at fresh available stock', () => {
  const result = resolveInstoreOrderLine(item, { indexRow, bridgeRow });
  assert.equal(result.product.price, 13.5);
  assert.equal(result.preference, 'Dark brown if available');
  assert.equal(result.product.minQty, 1);
  assert.throws(() => resolveInstoreOrderLine({ ...item, qty: 12 }, { indexRow, bridgeRow }), { status: 409 });
});

test('Instore checkout rejects an item that has fallen below the ten-unit display threshold', () => {
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow, bridgeRow: { ...bridgeRow, ONHAND: 10, BOOKED: 1 } }), { status: 409 });
});

test('Instore checkout rejects inactive, duplicate-main and unverified records', () => {
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow: { ...indexRow, is_active: false }, bridgeRow }), { status: 409 });
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow, bridgeRow, normalRows: [{ sku: '8618100133' }] }), { status: 409 });
  assert.throws(() => resolveInstoreOrderLine(item, { indexRow, bridgeRow: { ...bridgeRow, BOOKED: null } }), { status: 409 });
});

test('Preview cannot create a real order, while production retains the same resolver', async () => {
  const source = await readFile(new URL('../api/send-order.js', import.meta.url), 'utf8');
  assert.match(source, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(source, /Ordering is disabled in Preview/);
});
