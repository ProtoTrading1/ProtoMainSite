import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { matchSearchCategories } from '../../src/lib/searchCategories.js';

const categories = JSON.parse(readFileSync(new URL('../../src/data/categories.json', import.meta.url)));
const flat = [];
function flatten(nodes, path = []) {
  for (const node of nodes) {
    flat.push({ ...node, path: [...path, node.id] });
    if (node.children) flatten(node.children, [...path, node.id]);
  }
}
flatten(categories);

test('category discovery understands the same toy synonyms and transpositions as products', () => {
  for (const query of ['soft toys', 'sotf toys', 'soft tosy', 'plush toys', 'stuffed animals', 'teddy bears']) {
    const matches = matchSearchCategories(flat, query);
    assert.equal(matches[0]?.label, 'Soft Toys', query);
    assert.ok(matches[0].path.length > 1);
    assert.equal(new Set(matches.map((cat) => cat.label)).size, matches.length);
  }
});

test('categories preserve qualifiers and never fuzzy-match identifiers', () => {
  for (const query of ['plush pen', 'soft toy blue', 'blue teddy bear', '8710140011', 'ST40011-U', '', 'unlikelywords']) {
    assert.deepEqual(matchSearchCategories(flat, query), [], query);
  }
});

test('department prefixes still work and category navigation is bounded', () => {
  assert.ok(matchSearchCategories(flat, 'bea').some((cat) => cat.label === 'Beads'));
  assert.ok(matchSearchCategories(flat, 'bags').length > 0);
  assert.ok(matchSearchCategories(flat, 'bags', 2).length <= 2);
});

test('the matcher is taxonomy-driven across unrelated departments, including live-only additions', () => {
  const live = [
    { id: 'live-wallets', label: 'Wallets', path: ['bags', 'live-wallets'] },
    { id: 'live-books', label: 'Notebooks', path: ['stationery', 'live-books'] },
    { id: 'live-gift', label: 'Gift Bags', path: ['packaging', 'live-gift'] },
    { id: 'live-hair', label: 'Hair Clips', path: ['beauty', 'live-hair'] },
    { id: 'live-jewel', label: 'Jewellery', path: ['live-jewel'] },
    { id: 'live-backpack', label: 'Backpacks', path: ['bags', 'live-backpack'] },
    { id: 'new-category', label: 'Garden Tools', path: ['outdoor', 'new-category'] },
  ];
  for (const [query, id] of [
    ['purses', 'live-wallets'], ['notepads', 'live-books'], ['paper bags', 'live-gift'],
    ['hairpins', 'live-hair'], ['jewelry', 'live-jewel'], ['school bags', 'live-backpack'],
    ['garden tools', 'new-category'],
  ]) assert.equal(matchSearchCategories(live, query)[0]?.id, id, query);
});
