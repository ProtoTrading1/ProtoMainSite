import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('active registration asks for the Proto code early and submits it for matching', () => {
  const source = read('src/pages/LandingPage.jsx');
  assert.match(source, /STEP_LABELS = \['Company', 'Contact', 'Addresses', 'Business'\]/);
  assert.match(source, /id="trade-customer-code"/);
  assert.match(source, /customerCode: customerCode\.trim\(\)/);
  assert.match(source, /Leave it blank if you do not know it/);
  const codeField = source.indexOf('id="trade-customer-code"');
  assert.ok(codeField > source.indexOf('{step === 0 &&'));
  assert.ok(codeField < source.indexOf('{step === 1 &&', codeField));
});

test('the claimed old code is preserved separately and never allocated as the live code', () => {
  const source = read('api/register-trade.js');
  assert.match(source, /claimed_customer_code: claimedCustomerCode/);
  assert.match(source, /customer_code: allocatedCustomerCode/);
  assert.match(source, /allocatedCustomerCode = null/);
  assert.doesNotMatch(source, /\n\s+customer_code:\s*claimedCustomerCode[,\n]/);
});

test('the claimed-code migration documents that the value is review evidence only', () => {
  const migration = read('migrations/061_claimed_customer_code.sql');
  assert.match(migration, /add column if not exists claimed_customer_code text/i);
  assert.match(migration, /never grants access/i);
});
