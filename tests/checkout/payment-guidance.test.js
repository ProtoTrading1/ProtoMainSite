import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const drawerSource = fs.readFileSync(new URL('../../src/components/Drawer.jsx', import.meta.url), 'utf8');
const confirmationSource = fs.readFileSync(new URL('../../src/components/OrderConfirmModal.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const orderApiSource = fs.readFileSync(new URL('../../api/send-order.js', import.meta.url), 'utf8');

test('final checkout step clearly prevents premature payment', () => {
  assert.match(drawerSource, /This is an order request - not an invoice\./);
  assert.match(drawerSource, /Please do not make payment yet\./);
  assert.match(drawerSource, /'Submit order request'/);
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
