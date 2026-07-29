import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Promo codes are one redemption per customer. The check runs in BOTH places:
// validate-promo (so the cart says so immediately) and send-order (the
// authoritative gate — the cart check alone could be raced by submitting
// twice quickly).

const promoLib = fs.readFileSync(new URL('../../api/_promo-codes.js', import.meta.url), 'utf8');
const sendOrder = fs.readFileSync(new URL('../../api/send-order.js', import.meta.url), 'utf8');
const validate = fs.readFileSync(new URL('../../api/validate-promo.js', import.meta.url), 'utf8');

test('usage lookup exists and fails CLOSED when it cannot be verified', () => {
  assert.match(promoLib, /export async function hasCustomerUsedPromo/);
  assert.match(promoLib, /Could not verify promo code usage/, 'an outage never grants the discount');
  assert.match(promoLib, /\.eq\('customer_id', customerId\)/, 'scoped to the customer');
  assert.match(promoLib, /\.eq\('promo_code', normalized\)/, 'scoped to the code');
});

test('send-order rejects a code the customer already redeemed', () => {
  assert.match(sendOrder, /hasCustomerUsedPromo\(getPortalAdminClient\(\), user\.id, promoResult\.code\)/);
  assert.match(sendOrder, /already been used on a previous order/);
});

test('the cart validator reports an already-used code up front', () => {
  assert.match(validate, /hasCustomerUsedPromo\(getPortalAdminClient\(\), user\.id, result\.code\)/);
  assert.match(validate, /already been used on a previous order/);
});
