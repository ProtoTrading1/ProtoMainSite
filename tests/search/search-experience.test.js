import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const header = readFileSync(join(root, 'src/components/Header.jsx'), 'utf8');

test('desktop search has an explicit submit action and retains the slash shortcut', () => {
  assert.match(header, /className="header-search-premium__submit"/);
  assert.match(header, /keyboard shortcut: \//);
  assert.match(header, /event\.key !== '\/'/);
  assert.doesNotMatch(header, /className="header-search-premium__icon"/);
});

test('search distinguishes loading, connection failure and no-result states', () => {
  assert.match(header, /searchState === 'loading'/);
  assert.match(header, /searchState === 'error'/);
  assert.match(header, /Search couldn’t connect/);
  assert.match(header, /searchState !== 'loading' && searchState !== 'error'/);
});

test('product options do not wrap the quick-add button in an option role', () => {
  assert.doesNotMatch(header, /className=\{`sp-product-row[\s\S]{0,180}role="option"/);
  assert.match(header, /className="sp-product-main"\s+role="option"/);
});
