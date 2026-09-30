import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { catalogueResultsForQuery } from '../src/lib/catalogueResultQuery.js';

const app = readFileSync(join(import.meta.dirname, '..', 'src', 'App.jsx'), 'utf8');

test('hides a previous catalogue query while the newly committed query is pending', () => {
  const oldProducts = [{ id: 'soft-toy-a' }, { id: 'soft-toy-b' }];
  assert.deepEqual(
    catalogueResultsForQuery('8626110114', 'soft toys', oldProducts, 3),
    { products: [], total: 0 },
  );
});

test('keeps same-query catalogue results visible during a background refresh', () => {
  const currentProducts = [{ id: 'dolphin' }];
  assert.deepEqual(
    catalogueResultsForQuery('  8626110114 ', '8626110114', currentProducts, 1),
    { products: currentProducts, total: 1 },
  );
});

test('App isolates catalogue and Instore results from route changes before effects run', () => {
  assert.match(app, /useMemo\(\s*\(\) => catalogueResultsForQuery\(routeSearchQuery, catalogResultQuery, catalogProducts, catalogTotal\)/);
  assert.match(app, /const catalogueResultsPending = loading \|\| routeSearchQuery\.trim\(\) !== catalogResultQuery\.trim\(\)/);
  assert.match(app, /instoreSearch\.query\.trim\(\) === routeSearchQuery\.trim\(\)/);
  assert.match(app, /loading=\{catalogueResultsPending\}/);
  assert.match(app, /instoreSearch=\{visibleInstoreSearch\}/);
  assert.match(app, /\|\| catalogProducts\.find\(\(p\) => p\.id === item\.productId \|\| p\.code === item\.code\)/);
});
