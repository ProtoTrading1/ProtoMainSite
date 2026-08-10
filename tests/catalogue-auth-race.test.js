import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productsUrl = new URL('../src/lib/products.js', import.meta.url);

test('every customer catalogue request waits for authenticated headers', async () => {
  const source = await readFile(productsUrl, 'utf8');
  const productRequests = [...source.matchAll(
    /fetchJsonWithTimeout\(\s*(`\/api\/products[^`]*`|'\/api\/products')\s*,\s*\d+\s*,\s*({[^}]*})/g,
  )];

  assert.equal(productRequests.length, 5, 'all full, SKU, featured, identifier and browse requests are covered');
  for (const [, endpoint, options] of productRequests) {
    assert.match(
      options,
      /authenticated:\s*true/,
      `${endpoint} must not run before the customer session is attached`,
    );
  }
});

test('the initial featured catalogue load is coalesced until it settles', async () => {
  const source = await readFile(productsUrl, 'utf8');
  assert.match(source, /if \(_featuredLoad\?\.key === key\) return _featuredLoad\.promise/);
  assert.match(source, /_featuredLoad = \{ key, promise \}/);
  assert.match(source, /if \(_featuredLoad\?\.promise === promise\) _featuredLoad = null/);
});
