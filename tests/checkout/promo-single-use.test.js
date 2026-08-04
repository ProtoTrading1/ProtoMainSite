import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// Promo codes are one redemption per customer. The check runs in BOTH places:
// validate-promo (so the cart says so immediately) and send-order (the
// authoritative gate. send-order atomically claims the unique ledger row
// before capture, so two simultaneous submissions cannot both get a discount.

const promoLib = fs.readFileSync(new URL('../../api/_promo-codes.js', import.meta.url), 'utf8');
const sendOrder = fs.readFileSync(new URL('../../api/send-order.js', import.meta.url), 'utf8');
const validate = fs.readFileSync(new URL('../../api/validate-promo.js', import.meta.url), 'utf8');

test('usage lookup exists and fails CLOSED when it cannot be verified', () => {
  assert.match(promoLib, /export async function hasCustomerUsedPromo/);
  assert.match(promoLib, /Could not verify promo code usage/, 'an outage never grants the discount');
  assert.match(promoLib, /\.eq\('customer_id', customerId\)/, 'scoped to the customer');
  assert.match(promoLib, /\.eq\('promo_code', normalized\)/, 'scoped to the code');
});

test('redemptions are atomically claimed in a ledger that survives order deletion', () => {
  // The check used to read the orders table; deleting a test order erased the
  // redemption and made the code reusable — reproduced in production. The
  // ledger row is reserved before order capture and is never deleted with the
  // order. The DB unique index makes two concurrent claims impossible.
  assert.match(promoLib, /\.from\('promo_redemptions'\)/, 'usage check reads the ledger');
  assert.doesNotMatch(promoLib, /\.from\('orders'\)/, 'usage check no longer depends on the orders table');
  assert.match(promoLib, /export async function claimPromoRedemption/);
  assert.match(promoLib, /export async function finalisePromoRedemption/);
  assert.match(promoLib, /export async function releasePromoRedemption/);
  assert.match(sendOrder, /claimPromoRedemption\(portal, \{ customerId: user\.id, code: promo\.code \}\)/);
  assert.match(sendOrder, /finalisePromoRedemption\(portal, \{ redemptionId: promoRedemptionId, orderId, orderNumber \}\)/);
  const migration = fs.readFileSync(new URL('../../migrations/056_promo_redemptions_ledger.sql', import.meta.url), 'utf8');
  assert.match(migration, /create unique index if not exists promo_redemptions_customer_code/);
  assert.match(migration, /on public\.promo_redemptions \(customer_id, upper\(promo_code\)\)/);
});

test('send-order rejects a code the customer already redeemed', () => {
  assert.match(sendOrder, /hasCustomerUsedPromo\(portal, user\.id, promoResult\.code\)/);
  assert.match(sendOrder, /already been used on a previous order/);
});

test('PROTO75 is 7.5% and restricted to verified 10,000 Club sales', () => {
  assert.match(promoLib, /TEN_THOUSAND_CLUB_PROMO = 'PROTO75'/);
  assert.match(promoLib, /TEN_THOUSAND_CLUB_DISCOUNT_PCT = 7\.5/);
  assert.match(promoLib, /TEN_THOUSAND_CLUB_MIN_SALES = 10000/);
  assert.match(promoLib, /select\('sales_last_12_months'\)/);
  assert.doesNotMatch(promoLib, /monthly_spend/);
  assert.match(validate, /isCustomerEligibleForPromo\(getPortalAdminClient\(\), user\.id, result\.code\)/);
  assert.match(sendOrder, /isCustomerEligibleForPromo\(portal, user\.id, promoResult\.code\)/);
});

test('the cart validator reports an already-used code up front', () => {
  assert.match(validate, /hasCustomerUsedPromo\(getPortalAdminClient\(\), user\.id, result\.code\)/);
  assert.match(validate, /already been used on a previous order/);
});
