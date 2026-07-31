import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');

test('checkout CTA uses the restrained Proto red treatment', () => {
  const baseRule = css.match(/\.primary-order-button\s*\{([\s\S]*?)\}/)?.[1] ?? '';
  const hoverRule = css.match(/\.primary-order-button:hover\s*\{([\s\S]*?)\}/)?.[1] ?? '';

  assert.match(baseRule, /background:\s*#9f1d24/i);
  assert.match(baseRule, /box-shadow:\s*0 10px 24px rgba\(159,29,36,0\.18\)/i);
  assert.doesNotMatch(baseRule, /#dc2626/i);
  assert.match(hoverRule, /background:\s*#86171d/i);
});

test('checkout CTA replaces the dark focus outline with the brand gold ring', () => {
  const focusRule = css.match(/\.primary-order-button:focus-visible\s*\{([\s\S]*?)\}/)?.[1] ?? '';

  assert.match(focusRule, /outline:\s*3px solid var\(--proto-gold\)/i);
  assert.match(focusRule, /outline-offset:\s*2px/i);
});
