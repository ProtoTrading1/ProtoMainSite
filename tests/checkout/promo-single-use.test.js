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

test('redemptions live in a ledger that survives order deletion', () => {
  // The check used to read the orders table; deleting a test order erased the
  // redemption and made the code reusable — reproduced in production. The
  // ledger row is written the moment the order exists and is never deleted
  // with it, and the DB unique index makes a duplicate structurally
  // impossible even if two submissions race past the pre-capture check.
  assert.match(promoLib, /\.from\('promo_redemptions'\)/, 'usage check reads the ledger');
  assert.doesNotMatch(promoLib, /\.from\('orders'\)/, 'usage check no longer depends on the orders table');
  assert.match(promoLib, /export async function recordPromoRedemption/);
  assert.match(sendOrder, /recordPromoRedemption\(portal, \{/, 'send-order burns the code on capture');
  const migration = fs.readFileSync(new URL('../../migrations/056_promo_redemptions_ledger.sql', import.meta.url), 'utf8');
  assert.match(migration, /create unique index if not exists promo_redemptions_customer_code/);
  assert.match(migration, /on public\.promo_redemptions \(customer_id, upper\(promo_code\)\)/);
});

test('send-order rejects a code the customer already redeemed', () => {
  assert.match(sendOrder, /hasCustomerUsedPromo\(getPortalAdminClient\(\), user\.id, promoResult\.code\)/);
  assert.match(sendOrder, /already been used on a previous order/);
});

test('the cart validator reports an already-used code up front', () => {
  assert.match(validate, /hasCustomerUsedPromo\(getPortalAdminClient\(\), user\.id, result\.code\)/);
  assert.match(validate, /already been used on a previous order/);
});
