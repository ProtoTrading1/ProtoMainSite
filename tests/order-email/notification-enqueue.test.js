import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildOrderNotificationJobSpecs,
} from '../../api/_order-notification-enqueue.js';
import { notificationIdempotencyKey } from '../../api/_order-notification-queue.js';

function orderLines(count) {
  return Array.from({ length: count }, (_, index) => ({
    code: `SKU-${index + 1}`,
    name: `<Product & ${index + 1}>`,
    qty: index + 1,
  }));
}

const order = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  order_number: 'PT_00100',
  created_at: '2026-07-29T12:00:00.000Z',
};
const customer = {
  name: 'Victor & Sons <Trade>',
  email: 'VICTOR@example.com',
};

test('builds bounded safe email payloads containing all 250 order lines', () => {
  const jobs = buildOrderNotificationJobSpecs({
    order,
    customer,
    items: orderLines(250),
    internalRecipients: ['online@proto.co.za'],
  });
  const internal = jobs.find((job) => job.channel === 'internal_email');
  assert.match(internal.payload.htmlContent, /SKU-250/);
  assert.equal((internal.payload.htmlContent.match(/<tr><td>\d+<\/td>/g) || []).length, 250);
  assert.doesNotMatch(internal.payload.htmlContent, /<Product & 250>/);
  assert.match(internal.payload.htmlContent, /&lt;Product &amp; 250&gt;/);
  assert.equal('pdfBase64' in internal.payload, false);
  assert.ok(Buffer.byteLength(JSON.stringify(internal.payload), 'utf8') < 250_000);
});

test('creates the expected PDF and email durable job set', () => {
  const jobs = buildOrderNotificationJobSpecs({
    order,
    customer,
    items: orderLines(2),
    internalRecipients: ['GEORGE@proto.co.za', 'online@proto.co.za', 'online@proto.co.za'],
  });
  assert.deepEqual(jobs.map((job) => job.channel), [
    'pdf',
    'internal_email',
    'customer_email',
  ]);
  assert.deepEqual(
    jobs.find((job) => job.channel === 'internal_email').payload.to,
    [
      { email: 'george@proto.co.za', name: 'Proto Trading Orders' },
      { email: 'online@proto.co.za', name: 'Proto Trading Orders' },
    ],
  );
});

test('job specs produce stable deduplicated idempotency identities', () => {
  const jobs = buildOrderNotificationJobSpecs({
    order,
    customer,
    items: orderLines(1),
    internalRecipients: ['online@proto.co.za'],
  });
  const keys = jobs.map((job) => notificationIdempotencyKey({
    orderId: order.id,
    channel: job.channel,
    recipient: job.recipient,
  }));
  assert.equal(new Set(keys).size, jobs.length);
  assert.deepEqual(jobs.map((job) => job.channel), ['pdf', 'internal_email', 'customer_email']);
});

test('order enqueue hands the complete set to one atomic batch call', () => {
  const source = fs.readFileSync(
    new URL('../../api/_order-notification-enqueue.js', import.meta.url),
    'utf8',
  );
  assert.match(source, /queue\.enqueueNotificationBatch\(\{\s*orderId:[\s\S]+jobs: specs/);
  assert.doesNotMatch(source, /Promise\.all\(specs\.map/);
});
