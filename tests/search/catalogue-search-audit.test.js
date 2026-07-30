import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const header = readFileSync(join(root, 'src/components/Header.jsx'), 'utf8');
const categoryLanding = readFileSync(join(root, 'src/components/CategoryLanding.jsx'), 'utf8');
const products = readFileSync(join(root, 'src/lib/products.js'), 'utf8');

test('catalogue-wide header search clears a stale department route', () => {
  assert.match(
    header,
    /setTimeout\(\(\) => \{[\s\S]*?if \(val\.trim\(\)\) navigateForSearch\?\.\(\[\]\);[\s\S]*?setSearchQuery\(val\);[\s\S]*?\}, 350\)/,
  );
});

test('search results continue to use the full catalogue rather than the active browse branch', () => {
  assert.match(products, /const isCategoryBrowse = categoryPath\.length && !hasSearch/);
  assert.match(products, /if \(!hasSearch && !isCategoryBrowse\) \{\s*products = applyPathFilter\(products, categoryPath\);/);
});

test('subcategory type count uses singular copy for one child', () => {
  assert.match(
    categoryLanding,
    /\{sub\.children\.length\} \{sub\.children\.length === 1 \? 'type' : 'types'\}/,
  );
});
