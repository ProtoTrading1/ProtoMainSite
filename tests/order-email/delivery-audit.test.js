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
