import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const welcome = fs.readFileSync(new URL('../src/components/CustomerWelcome.jsx', import.meta.url), 'utf8');

test('signed-in customers receive a quiet in-page welcome', () => {
  assert.match(app, /<CustomerWelcome/);
  assert.match(welcome, /Welcome back, \{firstName\(customer\)\}/);
  assert.match(welcome, /customer\.business_name/);
  assert.match(welcome, /if \(!customer\?\.id\) return null/);
});

test('welcome links to existing order history without creating another customer flow', () => {
  assert.match(app, /onViewOrders=\{onViewProfile\}/);
  assert.match(welcome, /View recent orders/);
  assert.match(welcome, /Review or reorder previous products/);
  assert.doesNotMatch(app, /FirstLoginBuyingAssistant/);
  assert.equal(fs.existsSync(new URL('../migrations/064_customer_buying_assistant.sql', import.meta.url)), false);
});
