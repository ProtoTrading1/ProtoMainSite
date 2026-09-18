import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const componentPath = new URL('../src/components/ExtendedRangePage.jsx', import.meta.url);
const stylesheetPath = new URL('../src/components/InstoreProducts.css', import.meta.url);

test('uses one branded loader and a compact Instore hero', async () => {
  const [component, css] = await Promise.all([
    readFile(componentPath, 'utf8'),
    readFile(stylesheetPath, 'utf8'),
  ]);
  assert.equal((component.match(/instore-loading-logo/g) || []).length, 1);
  assert.equal(component.includes('instore-searching-logo'), false);
  assert.match(css, /\.instore-hero \{ padding: clamp\(18px, 2\.5vw, 30px\)/);
  assert.match(css, /\.instore h1 \{ font-size: clamp\(28px, 3\.5vw, 44px\)/);
});
