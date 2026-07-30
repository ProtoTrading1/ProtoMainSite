import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const drawerSource = fs.readFileSync(new URL('../../src/components/Drawer.jsx', import.meta.url), 'utf8');
const checkoutSource = fs.readFileSync(new URL('../../src/components/CheckoutModal.jsx', import.meta.url), 'utf8');
const confirmationSource = fs.readFileSync(new URL('../../src/components/OrderConfirmModal.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const orderApiSource = fs.readFileSync(new URL('../../api/send-order.js', import.meta.url), 'utf8');

test('final checkout step clearly prevents premature payment', () => {
  assert.match(drawerSource, /This is an order request — not an invoice\./);
  assert.match(drawerSource, /Please do not make payment yet\./);
  assert.match(drawerSource, /Send order request — no payment now/);
  assert.match(checkoutSource, /No payment is taken now\./);
});

test('checkout includes a pre-submit review of customer, delivery and order lines', () => {
  assert.match(checkoutSource, /Review your order request/);
  assert.match(checkoutSource, /customer\?\.business_name/);
  assert.match(checkoutSource, /customer\?\.customer_code/);
  assert.match(checkoutSource, /Delivery address/);
  assert.match(checkoutSource, /cartItems\.map/);
  assert.match(checkoutSource, /Subtotal incl\. VAT/);
  assert.match(checkoutSource, /Nothing is submitted from this screen\./);
});

test('below-minimum basket keeps shopping actionable', () => {
  assert.match(drawerSource, /Continue shopping — R\{remaining\.toFixed\(2\)\} remaining/);
  assert.doesNotMatch(drawerSource, /Add more products to submit/);
});

test('success state repeats the pro-forma payment instruction', () => {
  assert.match(confirmationSource, /Order request received\. Thank you\./);
  assert.match(confirmationSource, /No payment is required yet\./);
  assert.match(confirmationSource, /official pro-forma invoice/);
  assert.match(appSource, /orderNumber=\{submittedOrderNumber\}/);
});

test('customer acknowledgement contains the warning and API returns its order number', () => {
  assert.match(orderApiSource, /Please do not pay this estimated amount\./);
  assert.match(orderApiSource, /Payment should only be made after you receive your official pro-forma invoice/);
  assert.match(orderApiSource, /orderNumber,\s*\n\s*dbCaptureFailed/);
});
