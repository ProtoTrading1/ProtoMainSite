import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrderNotifyRecipients } from '../../api/_order-email-recipients.js';

// The rule changed: configuration used to REPLACE the default recipients, so
// setting ORDER_TO_EMAIL (which .env.example ships as orders@prototrading.co.za)
// silently dropped george@ and danieljoffeinfo@ off every order email. Only
// online@ was forced back in. Configuration may now only ADD.
const REQUIRED = ['george@proto.co.za', 'online@proto.co.za', 'danieljoffeinfo@gmail.com'];

test('the whole team is on every order even with no configuration', () => {
  assert.deepEqual(resolveOrderNotifyRecipients(''), REQUIRED);
});

test('configuration adds recipients and can never drop a required one', () => {
  const result = resolveOrderNotifyRecipients('orders@prototrading.co.za');
  for (const email of REQUIRED) {
    assert.ok(result.includes(email), `${email} must still receive the order`);
  }
  assert.ok(result.includes('orders@prototrading.co.za'), 'configured extra is added');
});

test('normalizes case and de-duplicates against the defaults', () => {
  assert.deepEqual(
    resolveOrderNotifyRecipients(' Online@Proto.co.za,online@proto.co.za , GEORGE@proto.co.za '),
    REQUIRED,
  );
});
