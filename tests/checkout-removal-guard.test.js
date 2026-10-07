import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutIncomingObservation, checkoutRemovalProof, stockOrderableAvailability } from '../lib/checkout-removal-guard.mjs';

const item = { qty: 1, preference: '  Gold\n crown ', product: { id: 'TK2154-GLD', sku: 'TK2154-GLD', code: '123', stockRemovalSource: 'main' } };
const row = { sku: 'TK2154-GLD', available_stock: 0, stock_qty: 0, to_order: false };
const availability = { canOrder: false, state: 'out_of_stock' };
const input = { item, row, availability, incomingKnown: true, uniqueRow: true, lineIndex: 3 };
test('eligible Main zero binds original line and exact submitted identity/preference', () => {
  assert.deepEqual(checkoutRemovalProof(input), { eligible: true, source: 'main', lineIndex: 3, productId: 'TK2154-GLD', sku: 'TK2154-GLD', code: '123', qty: 1, preference: 'Gold  crown' });
});
for (const [name, change] of [
  ['unknown incoming', { incomingKnown: false }], ['ambiguous source row', { uniqueRow: false }],
  ['wrong source', { item: { ...item, product: { ...item.product, stockRemovalSource: 'instore' } } }],
  ['legacy source', { item: { ...item, product: { ...item.product, stockRemovalSource: undefined } } }],
  ['extended range masquerading as Main', { item: { ...item, product: { ...item.product, isExtendedRange: true } } }],
  ['barcode fallback with mismatched SKU', { row: { ...row, sku: 'OTHER' } }],
  ['missing available_stock despite stock_qty zero', { row: { ...row, available_stock: undefined } }],
  ['To Order', { row: { ...row, to_order: true } }], ['unknown To Order', { row: { ...row, to_order: undefined } }],
  ['string To Order', { row: { ...row, to_order: 'false' } }],
  ['orderable availability', { availability: { canOrder: true, state: 'landed' } }],
  ['not-orderable incoming is still not sold out', { availability: { canOrder: false, state: 'incoming' } }],
]) test(`retains ${name}`, () => assert.deepEqual(checkoutRemovalProof({ ...input, ...change }), { eligible: false }));
for (const raw of [null, '', ' ', false, -1, -0.5, 0.5, NaN, Infinity, '0x0', 'garbage', 5]) {
  test(`raw available_stock ${String(raw)} cannot authorize deletion`, () => assert.deepEqual(checkoutRemovalProof({ ...input, row: { ...row, available_stock: raw } }), { eligible: false }));
}
test('numeric database zero string is accepted before normalization', () => assert.equal(checkoutRemovalProof({ ...input, row: { ...row, available_stock: '0.000' } }).eligible, true));
test('incoming successful empty array means known no override; null remains unknown', () => {
  assert.equal(checkoutIncomingObservation([], [row.sku]).known, true);
  assert.equal(checkoutIncomingObservation(null, [row.sku]).known, false);
});
test('incoming strict records reject malformed/duplicate/contradictory schemas while preserving normal projection', () => {
  const good = { sku: row.sku, incoming_status: 'none', incoming_qty: 0, incoming_eta: null, allow_preorder: false };
  assert.equal(checkoutIncomingObservation([good], [row.sku]).known, true);
  for (const rows of [[good, good], [{ ...good, incoming_status: 'bad' }], [{ ...good, incoming_qty: '' }], [{ ...good, allow_preorder: 'false' }], [{ ...good, incoming_qty: 1 }], [{ ...good, sku: 'OTHER' }], [{ ...good, sku: row.sku.toLowerCase() }], [{ ...good, sku: ` ${row.sku} ` }]]) {
    assert.equal(checkoutIncomingObservation(rows, [row.sku]).known, false);
    assert.ok(checkoutIncomingObservation(rows, [row.sku]).incomingBySku instanceof Map);
  }
});
test('landed and approved pre-order exceptions derive from actual availability', () => {
  for (const state of ['landed', 'incoming_preorder']) assert.equal(stockOrderableAvailability({ state, canOrder: true }), true);
  assert.equal(stockOrderableAvailability({ state: 'incoming', canOrder: false }), false);
});
