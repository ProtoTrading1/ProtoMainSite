import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('keeps product search available across the tablet breakpoint', async () => {
  const styles = await readSource('src/components/Header.css');

  assert.match(
    styles,
    /@media \(min-width: 901px\) and \(max-width: 1100px\)[\s\S]*?\.header-search-premium-wrap,[\s\S]*?\.header-search-premium \{[\s\S]*?width: var\(--search-width\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*?\.header-search-premium-wrap \{\s*display: none;/,
  );
});

test('keeps narrow-phone quantity and search controls inside their containers', async () => {
  const [header, styles] = await Promise.all([
    readSource('src/components/Header.jsx'),
    readSource('src/index.css'),
  ]);

  assert.match(header, /className="mobile-search-clear"/);
  assert.match(header, /className="mobile-search-close"/);
  assert.match(styles, /\.qty-stepper button \{ min-width: 44px; min-height: 44px; \}/);
  assert.match(styles, /\.qty-stepper input \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-width: 0;/);
  assert.match(
    styles,
    /@media \(max-width: 420px\)[\s\S]*?\.mobile-search-clear \{\s*display: none;/,
  );
});
