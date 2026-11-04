import test from 'node:test';
import assert from 'node:assert/strict';
import { SARONGI_REQUEST_SKUS, isSarongiRequestSku } from '../lib/sarongi-instore-requests.mjs';
import { SARONGI_GALLERIES } from '../lib/sarongi-instore-gallery-data.mjs';
import { buildExtendedRangeProducts } from '../api/extended-range.js';
import { validateInstoreBridgeStock } from '../api/stock.js';
import { resolveInstoreOrderLine } from '../api/send-order.js';
import { matchesInstoreSearch } from '../lib/instore-discovery.mjs';

test('all exact reviewed supplier codes work through feed, live stock and server order validation', () => {
  assert.equal(SARONGI_REQUEST_SKUS.length, 137);
  for (const sku of SARONGI_REQUEST_SKUS) for (const qty of [-7, 0, 2, 100]) {
    const row = { sku, barcode: sku, title: 'UNCHANGED TITLE', original_description: 'UNCHANGED TITLE',
      image_source: 'nutstore', image_url: 'https://example.test/reviewed.jpg', image_review_status: 'verified',
      visibility_status: 'search_only', is_active: true, price: 11.5, available_stock: qty };
    const bridgeRow = { CODE: sku, DESCR: row.title, PRICE_A: 10, UNITS: 'EACH', ONHAND: qty, BOOKED: 0 };
    const [product] = buildExtendedRangeProducts([row]);
    assert.equal(product.stockQty, qty); assert.equal(product.name, row.title);
    assert.equal(validateInstoreBridgeStock(sku, bridgeRow).qty, qty);
    const line = resolveInstoreOrderLine({ qty: 20, preference: 'Reviewed option', product: { sku, isExtendedRange: true, price: 0.01 } }, { indexRow: row, bridgeRow });
    assert.equal(line.product.sku, sku); assert.equal(line.product.price, 11.5);
    assert.equal(line.product.unitsOfIssue, 'EACH');
  }
});

test('held, private, absent-image and neighbouring codes receive no ordering exception', () => {
  for (const sku of ['KBRA2013', 'KBRA4024', 'KEAR1041', 'KDIS1003', 'KDIS1004', 'KDIS2004', 'KDIS2005', 'KDIS3004', 'KDIS4003', 'KBRA1032', 'KBRA3015', 'KNECK1202', 'KBRA6008BLUE']) {
    assert.equal(isSarongiRequestSku(sku), false, sku);
  }
});

test('new reviewed colour galleries remain searchable without using the supplier name', () => {
  for (const [sku, photos] of Object.entries(SARONGI_GALLERIES)) {
    const p = { sku, title: 'Reviewed jewellery', isExtendedRange: true, image: `https://www.proto.co.za${photos[0].path}` };
    for (const photo of photos) assert.equal(matchesInstoreSearch(p, photo.label), true, `${sku}: ${photo.label}`);
    assert.equal(matchesInstoreSearch(p, 'sarongi'), false, sku);
  }
});
