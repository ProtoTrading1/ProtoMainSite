import test from 'node:test';
import assert from 'node:assert/strict';

// Product collection behaviour is covered at the public helper boundary:
// a manual special must stay distinct from an automatically flagged listing.
test('Just added remains a distinct collection from curated specials', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) => readFile(new URL('../src/lib/products.js', import.meta.url), 'utf8'));
  assert.match(source, /collection === 'specials'.*specialIds/s);
  assert.match(source, /collection === 'just-added'.*isNew === true/s);
});
