import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildQuickOrderProductIndex,
  parseQuickOrderText,
  quickOrderImage,
  resolveQuickOrderLines,
  updateQuickOrderLineQty,
} from '../src/lib/quickOrder.js';

function product(overrides = {}) {
  return {
    id: 'TLUG1-TAN',
    sku: 'TLUG1-TAN',
    barcode: '6001002003004',
    name: 'Leather Luggage Bag | Large | Tan',
    price: 895,
    minQty: 1,
    stockOnHand: 8,
    availability: {
      state: 'in_stock',
      label: 'In stock',
      guidance: 'Available now',
      canOrder: true,
    },
    image: '',
    ...overrides,
  };
}

test('parses pasted invoice codes, ignores a CSV header and combines duplicates', () => {
  const lines = parseQuickOrderText([
    'Item code,Quantity',
    'tlug1-tan,4',
    'BAG102\t12',
    'TLUG1-TAN x 2',
  ].join('\n'));

  assert.deepEqual(lines.map(({ code, qty }) => ({ code, qty })), [
    { code: 'TLUG1-TAN', qty: 6 },
    { code: 'BAG102', qty: 12 },
  ]);
});

test('matches both SKU and barcode identifiers', () => {
  const item = product();
  const index = buildQuickOrderProductIndex([item]);
  assert.equal(index.get('TLUG1-TAN'), item);
  assert.equal(index.get('6001002003004'), item);
});

test('an approved product without an image remains a valid quick-order line', () => {
  const item = product({ image: '', localImage: '' });
  const [line] = resolveQuickOrderLines(parseQuickOrderText('TLUG1-TAN,4'), [item]);

  assert.equal(line.status, 'matched');
  assert.equal(line.valid, true);
  assert.equal(line.image, '');
  assert.equal(line.lineTotal, 3580);
});

test('uses a published Nutstore-derived image URL when supplied by the catalogue adapter', () => {
  const item = product({ nutstoreImage: 'https://images.proto.co.za/nutstore/TLUG1-TAN.webp' });
  assert.equal(quickOrderImage(item), item.nutstoreImage);
});

test('flags minimum quantity and revalidates when quantity is corrected', () => {
  const item = product({ minQty: 6 });
  const [line] = resolveQuickOrderLines(parseQuickOrderText('TLUG1-TAN,2'), [item]);
  assert.equal(line.status, 'below_minimum');
  assert.equal(line.valid, false);

  const [corrected] = updateQuickOrderLineQty([line], line.id, 6);
  assert.equal(corrected.status, 'matched');
  assert.equal(corrected.valid, true);
});

test('does not send unavailable or unknown lines to the basket-ready set', () => {
  const unavailable = product({
    id: 'NO-STOCK',
    sku: 'NO-STOCK',
    availability: { state: 'out_of_stock', label: 'Out of stock', guidance: 'Not currently orderable', canOrder: false },
  });
  const lines = resolveQuickOrderLines(parseQuickOrderText('NO-STOCK,1\nMISSING,2'), [unavailable]);
  assert.deepEqual(lines.map((line) => line.status), ['unavailable', 'not_found']);
  assert.equal(lines.filter((line) => line.valid).length, 0);
});

test('storefront integration keeps quick order routed through the existing protected catalogue and basket', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const component = readFileSync(new URL('../src/components/QuickOrder.jsx', import.meta.url), 'utf8');
  assert.match(app, /handleQuickOrderAdd/);
  assert.match(app, /MAX_CART_LINES/);
  assert.match(component, /fetchProducts\(\)/);
  assert.match(component, /Image does not block ordering/);
});

