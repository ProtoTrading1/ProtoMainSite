import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { customerOrderStatus, customerOrderTimeline } from '../src/lib/orderPresentation.js';

const ordersSource = fs.readFileSync(new URL('../src/lib/orders.js', import.meta.url), 'utf8');
const centreSource = fs.readFileSync(new URL('../src/components/MyOrdersCentre.jsx', import.meta.url), 'utf8');

test('order centre preserves customer-scoped newest-first history and shows only evidenced milestones', () => {
  assert.match(ordersSource, /\.eq\('customer_id', customerId\)/);
  assert.match(ordersSource, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(ordersSource, /\.limit\(limit\)/);
  assert.equal(customerOrderStatus('handed over'), 'Request received');
  assert.equal(customerOrderStatus('order in progress'), 'Stock being confirmed');
  assert.equal(customerOrderStatus('order sent'), 'Order confirmation sent');
  assert.equal(customerOrderStatus('payment received'), 'Payment received');
  assert.equal(customerOrderTimeline('order in progress')[1].state, 'current');
  assert.doesNotMatch(centreSource, /Ready for collection|With courier|Pro-forma ready/);
});

test('order centre details are opt-in, accessible, and route reorders through review', () => {
  assert.match(centreSource, /aria-expanded=\{open\}/);
  assert.match(centreSource, /View order/);
  assert.match(centreSource, /Price at time of order/);
  assert.match(centreSource, /Review & reorder available items/);
  assert.match(centreSource, /Final stock, current pricing and minimum quantities are checked/);
});
