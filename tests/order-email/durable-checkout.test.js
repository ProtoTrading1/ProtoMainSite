import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { isDurableNotificationQueueEnabled } from '../../api/send-order.js';

test('durable notification queue is fail-closed unless explicitly enabled', () => {
  assert.equal(isDurableNotificationQueueEnabled({}), false);
  assert.equal(isDurableNotificationQueueEnabled({ ORDER_NOTIFICATION_QUEUE_ENABLED: 'false' }), false);
  assert.equal(isDurableNotificationQueueEnabled({ ORDER_NOTIFICATION_QUEUE_ENABLED: 'TRUE' }), true);
});

test('checkout stores the atomic queue batch before legacy PDF or provider work', () => {
  const source = fs.readFileSync(new URL('../../api/send-order.js', import.meta.url), 'utf8');
  const enqueueAt = source.indexOf('await enqueueOrderNotificationJobs(orderId)');
  const legacyPdfAt = source.indexOf('const preparedItems = await prepareItems(orderItems)');
  assert.ok(enqueueAt > 0);
  assert.ok(legacyPdfAt > enqueueAt);
  assert.match(source, /notificationQueued:\s*true/);
  assert.match(source, /durable queue enqueue failed; using synchronous fallback/);
});
