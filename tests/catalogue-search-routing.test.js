import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogueSearchQueryFromRoute, catalogueSearchRoute } from '../src/lib/catalogueSearchRoute.js';

test('committed catalogue searches produce shareable root routes', () => {
  assert.deepEqual(catalogueSearchRoute(' soft toys '), {
    path: [],
    refinements: { q: 'soft toys' },
  });
  assert.deepEqual(catalogueSearchRoute(''), { path: [], refinements: {} });
});

test('catalogue search restores from a root hash but never consumes an Instore query', () => {
  assert.equal(catalogueSearchQueryFromRoute([], { q: 'soft toys' }), 'soft toys');
  assert.equal(catalogueSearchQueryFromRoute(['instore-products'], { q: 'soft toys' }), '');
  assert.equal(catalogueSearchQueryFromRoute(['extended-range'], { q: 'soft toys' }), '');
});
