import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_ATTACHMENT_BYTES, buildOrderEmailHtml } from '../../api/send-order.js';

// A 160-line order (PT_00099, R67 451.50) produced no team email at all: the
// PDF could not be attached, and the handler treated "no attachment" as a
// reason to skip the send entirely. The biggest orders were the ones the team
// never heard about. The email must always go out, and say why the PDF is not
// on it.

const items = [{
  qty: 2,
  product: { id: 'SKU-1', sku: 'SKU-1', code: 'BAR-1', name: 'Product 1', price: 10, image: '' },
}];

const base = {
  audience: 'team',
  orderNumber: 'PT_00099',
  customer: { name: 'Keenin Burnet', email: 'buyer@example.com' },
  items,
  totals: { subtotal: 20, discountAmount: 0, total: 20 },
};

test('attachment cap leaves headroom under Brevo\'s ~10MB message limit', () => {
  // base64 inflates by 4/3; the encoded attachment plus the HTML body must fit.
  assert.ok(MAX_ATTACHMENT_BYTES * (4 / 3) < 10 * 1024 * 1024, 'encoded attachment fits');
  assert.ok(MAX_ATTACHMENT_BYTES >= 4 * 1024 * 1024, 'cap is not so low that normal orders lose their PDF');
});

test('renders the too-large notice with a download link instead of dropping the email', () => {
  const link = 'https://site.proto.co.za/api/orders/abc/pdf?k=deadbeef1234';
  const html = buildOrderEmailHtml({
    ...base,
    notice: `<p>This order is too large to attach as a PDF. <a href="${link}">Download order PT_00099</a></p>`,
  });
  assert.match(html, /too large to attach as a PDF/);
  assert.ok(html.includes(link), 'the signed PDF download link is present');
  // The line items are still in the body, so the team can act without the PDF.
  assert.match(html, /Product 1/);
  assert.match(html, /PT_00099/);
});

test('renders normally when the PDF is attached (no notice)', () => {
  const html = buildOrderEmailHtml(base);
  assert.doesNotMatch(html, /too large to attach/);
  assert.doesNotMatch(html, /could not be generated/);
  assert.match(html, /Product 1/);
});
