import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');

test('every Instore category link is driven by the app router browse refinement', () => {
  assert.match(app, /browseCategory=\{String\(refinements\.browse \|\| ''\)\}/);
  assert.match(page, /`#\/instore-products\?browse=\$\{encodeURIComponent\(tile\.label\)\}`/);
  assert.match(page, /setCategory\(initialQuery \? '' : browseCategory\)/);
  assert.match(page, /\}, \[initialQuery, browseCategory, initialPage\]\);/);
  assert.doesNotMatch(page, /hashBrowseCategory|addEventListener\('hashchange'/);
});
