import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('all customer registration screens require trading channel and product selections', () => {
  for (const path of [
    'src/pages/LandingPage.jsx',
    'src/components/Questionnaire.jsx',
  ]) {
    const source = read(path);
    assert.match(source, /tradingChannels\.length > 0/);
    assert.match(source, /productCategories\.length > 0/);
    assert.match(source, /!productCategories\.includes\('Other'\) \|\| otherProductCategory\.trim\(\)/);
  }

  const registerPage = read('src/pages/RegisterPage.jsx');
  assert.match(registerPage, /tradingChannels\.length === 0/);
  assert.match(registerPage, /productCategories\.length === 0/);
  assert.match(registerPage, /How you trade — select at least one option/);
  assert.match(registerPage, /What you sell — select at least one option/);
});

test('registration explains the required choice and exposes multi-select state accessibly', () => {
  for (const path of [
    'src/pages/LandingPage.jsx',
    'src/components/Questionnaire.jsx',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /Optional: add any extra business details/);
    assert.match(source, /How do you trade\?/);
    assert.match(source, /What do you mainly sell\?/);
    assert.match(source, /role="group" aria-labelledby=/);
    assert.match(source, /aria-pressed=\{selected\}/);
  }

  const picker = read('src/components/register/BusinessCategoryPicker.jsx');
  assert.match(picker, /How do you trade\?/);
  assert.match(picker, /What do you mainly sell\?/);
  assert.match(picker, /\(required\)/);
  assert.match(picker, /role="group"/);
  assert.match(picker, /aria-labelledby=\{channelLabelId\}/);
  assert.match(picker, /aria-labelledby=\{categoryLabelId\}/);
  assert.match(picker, /aria-pressed=\{isSelected\}/);
  assert.match(picker, /required/);
});

test('registration API rejects missing structured business selections', () => {
  const source = read('api/register-trade.js');
  assert.match(source, /normalizedSalesChannels\.length === 0/);
  assert.match(source, /selectedProductCategories\.length === 0/);
  assert.match(source, /Please select at least one way that you trade\./);
  assert.match(source, /Please select at least one product category\./);
});
