import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a submitted Instore search prioritises matching products over browse tiles', async () => {
  const page = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');

  assert.match(page, /\{!submittedQuery && tiles\.length > 0 && <section className="instore-browse"/);
  assert.match(page, /<div ref=\{resultsRef\} className="instore-results"/);
});
