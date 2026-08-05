import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('business category selection gives visible and assistive selection counts', () => {
  const source = read('src/components/register/BusinessCategoryPicker.jsx');
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /selectedChannels\.length/);
  assert.match(source, /selectedCategories\.length/);
  assert.match(source, /aria-describedby=\{channelCountId\}/);
  assert.match(source, /aria-describedby=\{categoryCountId\}/);
  assert.match(source, /aria-label=\{`\$\{type\}\$\{isSelected/);
});

test('monthly spend asks about expected Proto purchases and exposes pressed state', () => {
  const source = read('src/components/register/MonthlySpendOptional.jsx');
  assert.match(source, /Expected monthly purchases from Proto/);
  assert.match(source, /what you expect to order from Proto each month/);
  assert.match(source, /aria-pressed=\{value === band\}/);
});

test('mobile registration actions use a safe-area sticky footer', () => {
  const styles = read('src/landing.css');
  assert.match(styles, /\.lp-register-page--standalone \.lp-register-step-actions \{[\s\S]*position: sticky/);
  assert.match(styles, /env\(safe-area-inset-bottom/);
});

test('active landing registration mirrors accessible selection feedback', () => {
  const source = read('src/pages/LandingPage.jsx');
  assert.match(source, /landing-trading-channel-count/);
  assert.match(source, /landing-product-category-count/);
  assert.match(source, /aria-describedby="landing-trading-channel-count"/);
  assert.match(source, /Expected monthly purchases from Proto/);
  assert.match(source, /aria-pressed=\{monthlySpend === band\}/);
});
