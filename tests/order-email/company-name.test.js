import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOrderEmailHtml, teamOrderSubject } from '../../api/send-order.js';

const customer = {
  business: 'Kiani',
  name: 'Kiara Barnard',
  email: 'info@kiani.co.za',
  phone: '0842311648',
};

test('internal order email shows the company before the contact person', () => {
  const html = buildOrderEmailHtml({
    audience: 'team',
    orderNumber: 'PT_00114',
    customer,
    items: [],
    totals: { subtotal: 0, total: 0 },
    deliveryMethod: "Customer's own courier",
  });

  assert.match(html, /Company \/ customer/);
  assert.match(html, />Kiani</);
  assert.match(html, /Contact: Kiara Barnard/);
  assert.ok(html.indexOf('Kiani') < html.indexOf('Contact: Kiara Barnard'));
});

test('team subject identifies the company and contact person', () => {
  assert.equal(
    teamOrderSubject({ customer, orderNumber: 'PT_00114' }),
    'New order received from Kiani (Kiara Barnard) — PT_00114',
  );
});

test('team email falls back cleanly when the company name is unavailable', () => {
  assert.equal(
    teamOrderSubject({ customer: { name: 'Kiara Barnard' }, orderNumber: 'PT_00114' }),
    'New order received from Kiara Barnard — PT_00114',
  );
});

test('customer acknowledgement keeps its existing personal greeting', () => {
  const html = buildOrderEmailHtml({
    audience: 'customer',
    orderNumber: 'PT_00114',
    customer,
    items: [],
    totals: { subtotal: 0, total: 0 },
    deliveryMethod: "Customer's own courier",
  });

  assert.match(html, /Hi Kiara Barnard,/);
  assert.doesNotMatch(html, /Company \/ customer/);
  assert.doesNotMatch(html, /Contact: Kiara Barnard/);
});
