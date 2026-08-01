import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  customerFacingCataloguePrice,
  looksLikeExVatPrice,
} from '../lib/catalogue-price.mjs';

const productsApi = readFileSync(new URL('../api/products.js', import.meta.url), 'utf8');
const orderApi = readFileSync(new URL('../api/send-order.js', import.meta.url), 'utf8');

test('repairs the verified ex-VAT fingerprint at the customer boundary', () => {
  assert.equal(customerFacingCataloguePrice(19.57), 22.5);
  assert.equal(customerFacingCataloguePrice(25.65), 29.5);
  assert.equal(customerFacingCataloguePrice(43.04), 49.5);
  assert.equal(looksLikeExVatPrice(19.57), true);
});

test('never adds VAT twice to established customer prices', () => {
  assert.equal(customerFacingCataloguePrice(22.5), 22.5);
  assert.equal(customerFacingCataloguePrice(29.5), 29.5);
  assert.equal(customerFacingCataloguePrice(579), 579);
});

test('leaves unrelated odd prices alone', () => {
  assert.equal(customerFacingCataloguePrice(12.34), 12.34);
  assert.equal(customerFacingCataloguePrice(239.43), 239.43);
  assert.equal(customerFacingCataloguePrice(0), 0);
});

test('catalogue and authoritative order pricing share the same guard', () => {
  assert.match(productsApi, /price:\s*customerFacingCataloguePrice\(row\.price\)/);
  assert.match(orderApi, /const rawPrice = Number\(row\?\.price\)/);
  assert.match(orderApi, /const price = customerFacingCataloguePrice\(rawPrice\)/);
});
