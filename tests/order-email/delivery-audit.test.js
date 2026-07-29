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

test('order notify is email-only: no WATI sends remain, and email+PDF advances status', () => {
  const notifySource = fs.readFileSync(new URL('../../api/_order-notify-core.js', import.meta.url), 'utf8');
  assert.doesNotMatch(notifySource, /watiSend|watiEnsure|watiConfig|_wati-notify/, 'no WATI client usage remains');
  assert.match(notifySource, /if \(emailSent && pdfStored\)/, 'the stored order + email advances the workflow');
  assert.match(notifySource, /whatsappNotConfigured: true/, 'admin audit is told email alone completes the round');
  assert.ok(!fs.existsSync(new URL('../../api/_wati-notify.js', import.meta.url).pathname), 'the WATI client is deleted');
});
