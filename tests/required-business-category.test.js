import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all customer registration screens require a nature of business selection', () => {
  for (const path of [
    'src/pages/LandingPage.jsx',
    'src/components/Questionnaire.jsx',
  ]) {
    const source = read(path);
    assert.match(source, /businessType\.length > 0/);
    assert.match(source, /!businessType\.includes\('Other'\) \|\| otherType\.trim\(\)/);
  }

  const registerPage = read('src/pages/RegisterPage.jsx');
  assert.match(registerPage, /businessType\.length === 0/);
  assert.match(registerPage, /Nature of business — select at least one option/);
});

test('registration API rejects a missing nature of business selection', () => {
  const source = read('api/register-trade.js');
  assert.match(source, /!String\(businessType \|\| ''\)\.trim\(\)/);
  assert.match(source, /Please select at least one nature of business option\./);
});
