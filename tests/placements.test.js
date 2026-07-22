import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPlacementMap,
  mergeCategoryPaths,
  normalizePlacementPath,
} from '../lib/placements.mjs';

// lib/placements.mjs is byte-identical with protoportal-admin. These tests
// exist so the website repo fails on its own if the copy is edited here and
// the two apps start disagreeing about where a product belongs.

test('normalizePlacementPath accepts an array of node ids', () => {
  assert.deepEqual(normalizePlacementPath(['art-supplies', 'paint']), ['art-supplies', 'paint']);
});

test('normalizePlacementPath parses the jsonb column arriving as a string', () => {
  assert.deepEqual(normalizePlacementPath('["art-supplies","paint"]'), ['art-supplies', 'paint']);
});

test('normalizePlacementPath rejects unusable input', () => {
  assert.equal(normalizePlacementPath(null), null);
  assert.equal(normalizePlacementPath([]), null);
  assert.equal(normalizePlacementPath('not json'), null);
});

test('mergeCategoryPaths keeps the primary first and appends placements', () => {
  assert.deepEqual(
    mergeCategoryPaths(['school-and-office', 'writing'], [['art-supplies', 'paint']]),
    [['school-and-office', 'writing'], ['art-supplies', 'paint']],
  );
});

test('mergeCategoryPaths does not repeat a placement equal to the primary', () => {
  assert.deepEqual(
    mergeCategoryPaths(['a', 'b'], [['a', 'b'], ['c']]),
    [['a', 'b'], ['c']],
  );
});

// A product filed only via a placement has no primary path; the storefront
// still needs a path to list it under.
test('mergeCategoryPaths handles an uncategorised primary', () => {
  assert.deepEqual(mergeCategoryPaths([], [['art-supplies']]), [['art-supplies']]);
});

test('buildPlacementMap groups paths by sku', () => {
  const map = buildPlacementMap([
    { website_sku: 'SKU1', node_path: ['a'] },
    { website_sku: 'SKU1', node_path: '["b","c"]' },
    { website_sku: 'SKU2', node_path: ['d'] },
  ]);
  assert.deepEqual(map.get('SKU1'), [['a'], ['b', 'c']]);
  assert.deepEqual(map.get('SKU2'), [['d']]);
});

test('buildPlacementMap skips rows with no usable path', () => {
  const map = buildPlacementMap([
    { website_sku: 'SKU1', node_path: [] },
    { website_sku: '', node_path: ['a'] },
  ]);
  assert.equal(map.size, 0);
});
