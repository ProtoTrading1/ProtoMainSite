import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { customerAvailabilityLabel, resolveProductAvailability } from '../lib/product-availability.mjs';

const readSource = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('SR0002 /8611100002N landed marker says Stock available without changing stock rules', () => {
  const availability = resolveProductAvailability({ stockQty: 0, incoming: { incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001 } });
  assert.deepEqual(availability, { state: 'landed', label: 'Stock available', guidance: 'Available subject to confirmation', canOrder: true,
    stockQty: 0, incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001, incomingEta: '', allowPreorder: false });
  assert.equal(customerAvailabilityLabel({ ...availability, label: 'Landed - being received' }), 'Stock available', 'cached and live labels agree');
  assert.equal(resolveProductAvailability({ stockQty: 0, incoming: { incomingStatus: 'landed_awaiting_grv', incomingQty: 0 } }).label, 'Out of stock');
  assert.equal(resolveProductAvailability({ stockQty: 2, incoming: { incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001 } }).label, 'Low stock');
});

test('other incoming and receiving statuses retain their labels and ordering rules', () => {
  for (const incomingStatus of ['on_the_way', 'customs']) {
    const incoming = resolveProductAvailability({ stockQty: 0, incoming: { incomingStatus, incomingQty: 0.001 } });
    assert.equal(customerAvailabilityLabel(incoming), 'On the way'); assert.equal(incoming.canOrder, false);
    const preorder = resolveProductAvailability({ stockQty: 0, incoming: { incomingStatus, incomingQty: 0.001, allowPreorder: true } });
    assert.equal(customerAvailabilityLabel(preorder), 'On the way — pre-order'); assert.equal(preorder.canOrder, true);
  }
  const partial = resolveProductAvailability({ stockQty: 0, incoming: { incomingStatus: 'partially_received', incomingQty: 1 } });
  assert.equal(customerAvailabilityLabel(partial), 'Landed — being received'); assert.equal(partial.canOrder, true);
});

test('availability follows one explicit priority order', () => {
  assert.equal(resolveProductAvailability({ stockQty: 12, toOrder: true }).state, 'in_stock');
  assert.equal(resolveProductAvailability({ stockQty: 3 }).state, 'low_stock');
  assert.equal(resolveProductAvailability({ stockQty: -2 }).state, 'out_of_stock');
  assert.equal(resolveProductAvailability({ stockQty: 0, toOrder: true }).state, 'to_order');

  const landed = resolveProductAvailability({
    stockQty: 0,
    incoming: { incomingStatus: 'landed_awaiting_grv', incomingQty: 100 },
  });
  assert.equal(landed.state, 'landed');
  assert.equal(landed.canOrder, true);

  const transit = resolveProductAvailability({
    stockQty: 0,
    incoming: { incomingStatus: 'on_the_way', incomingQty: 100 },
  });
  assert.equal(transit.state, 'incoming');
  assert.equal(transit.canOrder, false);

  const preorder = resolveProductAvailability({
    stockQty: 0,
    incoming: {
      incomingStatus: 'customs', incomingQty: 100, incomingEta: '2026-08-01', allowPreorder: true, shipmentRef: 'PRIVATE-42',
    },
  });
  assert.equal(preorder.state, 'incoming_preorder');
  assert.equal(preorder.canOrder, true);
  assert.equal(preorder.guidance, 'Expected 1 Aug 2026');
  assert.equal('shipmentRef' in preorder, false, 'internal shipment reference must not reach customers');
});

test('catalogue, live-stock and order verification consume the shared contract', async () => {
  const [productsApi, stockApi, orderApi, card] = await Promise.all([
    readSource('api/products.js'),
    readSource('api/stock.js'),
    readSource('api/send-order.js'),
    readSource('src/components/ProductCard.jsx'),
  ]);

  assert.match(productsApi, /availability:\s*availabilityForRow\(row, incoming\)/);
  assert.match(stockApi, /const availability = availabilityForRow\(row, incoming\)/);
  assert.match(orderApi, /if \(!availability\.canOrder\)/);
  assert.match(orderApi, /availabilityState:\s*availability\.state/);
  assert.match(card, /data\.availability \|\| null/);
});

test('cache freshness includes incoming availability changes', async () => {
  const [productsApi, availabilityApi] = await Promise.all([
    readSource('api/products.js'),
    readSource('api/_product-availability.js'),
  ]);
  assert.match(availabilityApi, /get_website_product_availability_version/);
  assert.match(productsApi, /incomingNewest/);
  assert.match(productsApi, /incomingCount/);
});
