import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../src/components/Header.css', import.meta.url), 'utf8');

test('desktop suggestions have bounded width and readable names, prices and identifiers', () => {
  assert.match(css, /width: min\(640px, calc\(100vw - 32px\)\)/);
  assert.match(css, /grid-template-columns: 44px minmax\(0, 1fr\) max-content/);
  assert.match(css, /white-space: normal/);
  assert.match(css, /\.header-search-dropdown \.sp-product-price \{ color: #F3F4F6/);
});

test('phone suggestions fit short content while bounding long lists', () => {
  assert.match(css, /\.mobile-search-results\[role="listbox"\] \{\s*bottom: auto/);
  assert.match(css, /max-height: min\(58dvh, calc\(100dvh - 144px\)\)/);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /\.mobile-search-results \.sp-product-price \{\s*grid-column: 2/);
});
