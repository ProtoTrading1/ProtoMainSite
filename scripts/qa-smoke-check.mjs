#!/usr/bin/env node
/**
 * Portal smoke checks for plumbing audit.
 * Run: node scripts/qa-smoke-check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { injectMotarroIntoTree, isMotarroProduct, enrichMotarroCategoryFields } from '../lib/mottaro-category.mjs';
import { shouldShowPopup, dismissPopup } from '../src/lib/popupSpecial.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('Portal QA smoke checks…\n');

// Item 2 — Mottaro inject matches admin
const tree = injectMotarroIntoTree([
  { id: 'arts-and-crafts', label: 'Arts and Crafts', children: [{ id: 'art-supplies', label: 'Art Supplies', children: [] }] },
  { id: 'stationery', label: 'Stationery', children: [] },
]);
assert.ok(tree.some((n) => n.id === 'mottaro'), 'Mottaro node injected');
console.log('✓ Item 2 Mottaro taxonomy inject');

const row = { title: 'MOTTARO Canvas 8x10', category: 'Arts and Crafts', subcategory_one: 'Art Supplies' };
assert.ok(isMotarroProduct(row), 'isMotarroProduct detects brand');
const product = enrichMotarroCategoryFields(
  { categoryPath: ['arts-and-crafts', 'art-supplies'] },
  row,
  tree,
  ['arts-and-crafts', 'art-supplies'],
);
assert.ok(product.categoryPaths?.length >= 2, 'categoryPaths includes Mottaro path');
assert.equal(product.categoryPaths[0][0], 'arts-and-crafts');
assert.equal(product.categoryPaths[1][0], 'mottaro');
console.log('✓ Item 2 Mottaro product paths');

const taxonomySrc = readFileSync(join(root, 'src/lib/taxonomy.js'), 'utf8');
assert.doesNotMatch(taxonomySrc, /['"]motarro['"]\s*:\s*['"]stationery['"]/, 'motarro→stationery alias removed');
console.log('✓ Item 2 legacy motarro alias removed');

// Item 3 — popup seen-flag keys on updatedAt
const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => ls.get(k) ?? null,
  setItem: (k, v) => { ls.set(k, String(v)); },
  removeItem: (k) => { ls.delete(k); },
};
const cfgA = { active: true, imageUrl: 'https://x/a.jpg', updatedAt: '2026-01-01T00:00:00Z' };
const cfgB = { active: true, imageUrl: 'https://x/b.jpg', updatedAt: '2026-01-02T00:00:00Z' };
assert.equal(shouldShowPopup({ active: false, imageUrl: 'x', updatedAt: '1' }), false, 'inactive hides');
assert.equal(shouldShowPopup(cfgA), true, 'first view shows');
dismissPopup(cfgA);
assert.equal(shouldShowPopup(cfgA), false, 'dismissed same version hidden');
assert.equal(shouldShowPopup(cfgB), true, 'new updatedAt re-shows');
console.log('✓ Item 3 popup seen-flag uses updatedAt');

// Item 4 — sort-order TTL tightened; catalogue LS key excludes sort orders
const productsSrc = readFileSync(join(root, 'src/lib/products.js'), 'utf8');
assert.match(productsSrc, /SORT_ORDERS_TTL\s*=\s*15_000/, 'sort-order TTL is 15s');
assert.doesNotMatch(productsSrc, /localStorage.*sort/i, 'sort orders not in localStorage catalogue key');
console.log('✓ Item 4 sort-order cache settings');

console.log('\nAll portal smoke checks passed.');
