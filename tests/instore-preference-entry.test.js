import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('adding an Instore item clears only the entry box, not the basket note', async () => {
  const source = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');
  assert.match(source, /addToCart\(item, qty, point, preferenceFor\(product\.id\)\)/);
  assert.match(source, /setPreferences\(\(current\) => \(\{ \.\.\.current, \[product\.id\]: '' \}\)\)/);
});
