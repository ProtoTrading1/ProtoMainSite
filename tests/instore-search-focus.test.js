import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a submitted Instore search prioritises matching products over browse tiles', async () => {
  const page = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');

  assert.match(page, /\{!submittedQuery && tiles\.length > 0 && <section className="instore-browse"/);
  assert.match(page, /<div ref=\{resultsRef\} className="instore-results"/);
});

test('search results expose one accessible status and useful recovery actions', async () => {
  const page = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/InstoreProducts.css', import.meta.url), 'utf8');

  assert.match(page, /aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(page, /className="instore-loading" role="status"/);
  assert.match(page, /> Edit search</);
  assert.match(page, /> Browse all products</);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.instore--search-active \.instore-grid\{grid-template-columns:1fr/);
  assert.match(css, /@media\(max-width:360px\)[\s\S]*?\.instore-clear-results\{width:100%/);
});
