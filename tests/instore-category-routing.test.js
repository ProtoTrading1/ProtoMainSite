import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');

test('every Instore category link is driven by the app router browse refinement', () => {
  assert.match(app, /browseCategory=\{String\(refinements\.browse \|\| ''\)\}/);
  assert.match(app, /onBrowseCategoryChange=\{\(nextCategory\)/);
  assert.match(page, /useEffect\(\(\) => \{\s*setCategory\(browseCategory\);[\s\S]*\}, \[browseCategory\]\);/);
  assert.doesNotMatch(page, /hashBrowseCategory|addEventListener\('hashchange'/);
});
