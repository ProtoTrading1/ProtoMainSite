import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrderNotifyRecipients } from '../../api/_order-email-recipients.js';

test('always includes the operational order mailbox when configuration overrides defaults', () => {
  assert.deepEqual(
    resolveOrderNotifyRecipients('george@proto.co.za,daniel@example.com'),
    ['george@proto.co.za', 'daniel@example.com', 'online@proto.co.za'],
  );
});

test('normalizes and de-duplicates configured recipients', () => {
  assert.deepEqual(
    resolveOrderNotifyRecipients(' Online@Proto.co.za,online@proto.co.za '),
    ['online@proto.co.za'],
  );
});
