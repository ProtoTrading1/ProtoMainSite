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
