import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const header = readFileSync(join(root, 'src/components/Header.jsx'), 'utf8');
const categoryLanding = readFileSync(join(root, 'src/components/CategoryLanding.jsx'), 'utf8');
const products = readFileSync(join(root, 'src/lib/products.js'), 'utf8');

test('committing a header search clears a stale department route', () => {
  // #179 moved the route-clear out of the typing debounce and onto the
  // explicit commit paths. The guarantee is unchanged for the customer:
  // while typing, results already span the whole catalogue (products.js
  // bypasses the department filter whenever a search term exists — asserted
  // below), and the moment a search is committed the department route is
  // cleared so the breadcrumb cannot claim otherwise.
  const commitBlock = header.slice(
    header.indexOf('const commitSearch'),
    header.indexOf('}', header.indexOf('setSearchOpen(false)', header.indexOf('const commitSearch'))),
  );
  assert.match(commitBlock, /navigateForSearch\?\.\(\[\]\)/, 'Enter-committed search returns to the full catalogue');
  const pickBlock = header.slice(
    header.indexOf('const pickProduct'),
    header.indexOf('const pickCategory'),
  );
  assert.match(pickBlock, /navigateForSearch\?\.\(\[\]\)/, 'picking a product suggestion returns to the full catalogue');
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
