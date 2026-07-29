import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../../api/send-order.js', import.meta.url), 'utf8');

test('records the customer acknowledgement result alongside the team delivery log', () => {
  assert.match(source, /customerEmailSent:\s*Boolean\(customerAck\?\.sent\)/);
  assert.match(source, /customerEmailRecipient:/);
  assert.match(source, /customerEmailMessageId:/);
  assert.match(source, /customerEmailFailReason:/);
  assert.match(source, /readOrderNotifyLog\(orderId\)/);
  assert.match(source, /saveOrderNotifyLog\(orderId/);
});

test('treats WhatsApp as accepted until a delivery webhook confirms it', () => {
  const notifySource = fs.readFileSync(new URL('../../api/_order-notify-core.js', import.meta.url), 'utf8');
  assert.match(notifySource, /accepted:\s*sent\.length/);
  assert.match(notifySource, /deliveryConfirmed:\s*false/);
  assert.match(notifySource, /if \(emailSent && pdfStored\)/);
  assert.doesNotMatch(notifySource, /if \(emailSent && whatsappOk\)/);
});
