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

test('registration explains the required choice and exposes multi-select state accessibly', () => {
  for (const path of [
    'src/pages/LandingPage.jsx',
    'src/components/Questionnaire.jsx',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /Optional: add any extra business details/);
    assert.match(source, /Select at least one nature of business/);
    assert.match(source, /role="group" aria-labelledby=/);
    assert.match(source, /aria-pressed=\{businessType\.includes\(t\)\}/);
  }

  const picker = read('src/components/register/BusinessCategoryPicker.jsx');
  assert.match(picker, /Nature of business/);
  assert.match(picker, /\(required\)/);
  assert.match(picker, /role="group"/);
  assert.match(picker, /aria-labelledby=\{labelId\}/);
  assert.match(picker, /aria-pressed=\{isSelected\}/);
  assert.match(picker, /required/);
});

test('registration API rejects a missing nature of business selection', () => {
  const source = read('api/register-trade.js');
  assert.match(source, /!String\(businessType \|\| ''\)\.trim\(\)/);
  assert.match(source, /Please select at least one nature of business option\./);
});
