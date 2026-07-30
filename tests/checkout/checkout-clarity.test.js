import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getDeliveryAddressReview } from '../../src/lib/checkoutReview.js';

const checkoutSource = fs.readFileSync(
  new URL('../../src/components/CheckoutModal.jsx', import.meta.url),
  'utf8',
);

test('flags a location-only delivery address without blocking checkout', () => {
  const result = getDeliveryAddressReview({
    delivery_address: 'Cape Town, Western Cape, South Africa',
  });

  assert.equal(result.complete, false);
  assert.match(result.warning, /street address, suburb and postal code/);
});

test('accepts complete structured and free-form delivery addresses', () => {
  assert.equal(getDeliveryAddressReview({
    street_name: '12 Main Road',
    suburb: 'Woodstock',
    city: 'Cape Town',
    postal_code: '7925',
  }).complete, true);

  assert.equal(getDeliveryAddressReview({
    delivery_address: 'Unit 5, 12 Main Road, Woodstock, Cape Town, 7925',
  }).complete, true);
});

test('checkout explains the options step accurately and exposes validation', () => {
  assert.doesNotMatch(checkoutSource, /choose your update preference/i);
  assert.match(checkoutSource, /On the next screen, choose delivery and add any PO\/reference\./);
  assert.match(checkoutSource, /No payment is taken now\./);
  assert.match(checkoutSource, /role="alert"/);
  assert.match(checkoutSource, /aria-invalid=\{Boolean\(promoError\)\}/);
  assert.match(checkoutSource, /aria-labelledby="checkout-whatsapp-label"/);
});
