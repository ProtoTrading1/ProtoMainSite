import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = [
  '../src/Root.jsx',
  '../src/components/Header.jsx',
  '../src/components/Sidebar.jsx',
  '../src/components/MobileNav.jsx',
  '../package.json',
  '../vercel.json',
];

test('Intercom is not loaded or offered by the customer storefront', () => {
  for (const file of files) {
    const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /intercom|Ask Proto/i, `${file} must remain Intercom-free`);
  }
});
