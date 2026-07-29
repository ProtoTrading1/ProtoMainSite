import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOUTH_AFRICA_VAT_RATE,
  priceIncludingVat,
} from '../../lib/pricing.mjs';

test('uses the South African VAT rate', () => {
  assert.equal(SOUTH_AFRICA_VAT_RATE, 0.15);
});

test('converts the Positill ex-VAT price for SKU 8621000002', () => {
  assert.equal(priceIncludingVat(43.04), 49.5);
});

test('converts the displayed hat price from R56.52 to R65.00', () => {
  assert.equal(priceIncludingVat(56.52), 65);
});

test('returns zero for missing or invalid source prices', () => {
  assert.equal(priceIncludingVat(undefined), 0);
  assert.equal(priceIncludingVat('not-a-price'), 0);
});
