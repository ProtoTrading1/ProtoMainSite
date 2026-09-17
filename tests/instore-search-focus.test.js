import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a submitted Instore search prioritises matching products over browse tiles', async () => {
  const page = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');

  assert.match(page, /\{!submittedQuery && !newestFirst && tiles\.length > 0 && <section className="instore-browse"/);
  assert.match(page, /<div ref=\{resultsRef\} className="instore-results"/);
});

test('the Instore landing page features newest mixed products and category browsing leads with newer codes', async () => {
  const page = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');
  const discovery = await readFile(new URL('../lib/instore-discovery.mjs', import.meta.url), 'utf8');

  assert.match(page, /FEATURED NOW/);
  assert.match(page, /Latest Instore finds/);
  assert.match(page, /setNewestFirst\(true\)/);
  assert.match(discovery, /compareProductCodes\(right\?\.sku, left\?\.sku\)/);
});
