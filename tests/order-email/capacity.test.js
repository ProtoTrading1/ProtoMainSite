import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_ORDER_LINES,
  TEAM_EMAIL_MAX_ATTEMPTS,
  TEAM_EMAIL_TIMEOUT_MS,
  buildOrderEmailHtml,
  isRetryableBrevoStatus,
  paginateOrderItems,
} from '../../api/send-order.js';

function buildItems(count) {
  return Array.from({ length: count }, (_, index) => ({
    qty: index + 1,
    product: {
      id: `SKU-${String(index + 1).padStart(3, '0')}`,
      sku: `SKU-${String(index + 1).padStart(3, '0')}`,
      code: `BAR-${String(index + 1).padStart(3, '0')}`,
      name: `Product ${index + 1}`,
      price: 10,
      image: '',
    },
  }));
}

test('supports and renders a complete 250-line internal order email', () => {
  const items = buildItems(250);
  const html = buildOrderEmailHtml({
    audience: 'team',
    orderNumber: 'PT_TEST_250',
    customer: { name: 'Test Customer', email: 'test@example.com' },
    items,
    totals: { subtotal: 313750, discountAmount: 0, total: 313750 },
    deliveryMethod: 'In store pick up',
    customerNotes: '',
    promo: null,
  });

  assert.equal(MAX_ORDER_LINES, 250);
  assert.match(html, /BAR-001/);
  assert.match(html, /Product 250/);
  assert.match(html, /250 product lines/);
  assert.ok(Buffer.byteLength(html, 'utf8') < 1_000_000);
});

test('paginates all 250 PDF rows without dropping a line', () => {
  const pages = paginateOrderItems(250, 8);
  assert.equal(pages.reduce((sum, size) => sum + size, 0), 250);
  assert.ok(pages.every((size) => size > 0));
});

test('retries only temporary Brevo failures within a bounded window', () => {
  assert.equal(TEAM_EMAIL_MAX_ATTEMPTS, 2);
  assert.equal(TEAM_EMAIL_TIMEOUT_MS, 15000);
  assert.equal(isRetryableBrevoStatus(429), true);
  assert.equal(isRetryableBrevoStatus(503), true);
  assert.equal(isRetryableBrevoStatus(400), false);
});
