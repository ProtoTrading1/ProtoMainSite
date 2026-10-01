import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { matchesInstoreSearch } from '../lib/instore-discovery.mjs';

test('object searches match descriptions, not every member of a broad department', () => {
  const backpack = { sku: 'B001', title: 'BACKPACK SCHOOL BAG', category: 'BAGS & WALLETS' };
  const purse = { sku: 'W001', title: 'PURSE PRINTED LEATHER', category: 'BAGS & WALLETS' };
  for (const query of ['wallet', 'wallets', 'purse', 'purses']) {
    assert.equal(matchesInstoreSearch(backpack, query), false, query);
    assert.equal(matchesInstoreSearch(purse, query), true, query);
  }
  assert.equal(matchesInstoreSearch(backpack, 'school bags'), true);
  assert.equal(matchesInstoreSearch(purse, 'school bags'), false);
  const pen = { title: 'PEN BALLPOINT', category: 'STATIONERY NOTEBOOKS' };
  assert.equal(matchesInstoreSearch(pen, 'notepads'), false);
  assert.equal(matchesInstoreSearch({ title: 'NOTEBOOK A5', category: 'STATIONERY' }, 'notepads'), true);
});

test('pending and unavailable sources never announce a completed empty search', () => {
  const source = readFileSync(new URL('../src/components/MainContent.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(loading \|\| \(searchKey && instoreSearch.loading\)\)/);
  assert.match(source, /setResultsAnnouncement\('Searching products…'\)/);
  assert.match(source, /the search is incomplete/);
  assert.match(source, /!instoreSearch.loading && !instoreSearch.error && instoreSearch.products.length === 0/);
});
