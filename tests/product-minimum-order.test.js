import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const productsApi = readFileSync(new URL('../api/products.js', import.meta.url), 'utf8');
const orderApi = readFileSync(new URL('../api/send-order.js', import.meta.url), 'utf8');

test('catalogue exposes the persisted product minimum', () => {
  assert.match(productsApi, /'min_order_qty'/);
  assert.match(productsApi, /minQty: Math\.max\(1/);
});

test('order submission rechecks the authoritative minimum', () => {
  assert.match(orderApi, /qty < minQty/);
  assert.match(orderApi, /minimum order of \$\{minQty\}/);
});
