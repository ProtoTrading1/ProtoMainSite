import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('registration asks returning customers for their previous Proto code', () => {
  const source = read('src/pages/RegisterPage.jsx');
  assert.match(source, /Previous Proto customer code/);
  assert.match(source, /customerCode: existingCustomerCode\.trim\(\)\.toUpperCase\(\)/);
  assert.match(source, /Leave it blank if you do not know it/);
});
