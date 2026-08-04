import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCustomerOrderWhatsappAcknowledgement,
  sendCustomerOrderWhatsappAcknowledgement,
} from '../api/_customer-order-whatsapp.js';

const optedIn = { name: 'George Zitianellis', phone: '082 123 4567', accept_whatsapp: true };

test('customer order WhatsApp is eligible only for an opted-in, server-supplied phone', () => {
  const result = buildCustomerOrderWhatsappAcknowledgement({ customer: optedIn, orderNumber: 'PT_00114' });
  assert.equal(result.ok, true);
  assert.equal(result.recipient, '27821234567');
  assert.match(result.message, /George/);
  assert.match(result.message, /PT_00114/);
  assert.doesNotMatch(result.message, /082 123 4567/);
  assert.equal(buildCustomerOrderWhatsappAcknowledgement({ customer: { ...optedIn, accept_whatsapp: false }, orderNumber: 'PT_00114' }).reason, 'not-opted-in');
  assert.equal(buildCustomerOrderWhatsappAcknowledgement({ customer: { ...optedIn, phone: 'invalid' }, orderNumber: 'PT_00114' }).reason, 'invalid-phone');
});

test('preview acknowledgement is closed by default and a test transport is explicit', async () => {
  let calls = 0;
  const input = { customer: optedIn, orderNumber: 'PT_00114' };
  const closed = await sendCustomerOrderWhatsappAcknowledgement(input, { transport: async () => { calls += 1; return { sent: true }; } });
  assert.equal(closed.reason, 'not-configured');
  assert.equal(calls, 0);
  const sent = await sendCustomerOrderWhatsappAcknowledgement(input, { enabled: true, transport: async (payload) => { calls += 1; assert.equal(payload.recipient, '27821234567'); return { sent: true, providerStatus: 200 }; } });
  assert.equal(sent.sent, true);
  assert.equal(calls, 1);
});
