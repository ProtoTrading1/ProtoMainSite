import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readSource = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

describe('mobile catalogue pagination', () => {
  it('keeps the pager clear of the fixed mobile navigation on small phones', async () => {
    const css = await readSource('src/index.css');

    assert.match(
      css,
      /\.content-area\s*\{\s*padding:\s*10px 10px calc\(88px \+ env\(safe-area-inset-bottom\)\);\s*\}/,
      'small-phone styles must preserve enough bottom padding for the fixed tab bar',
    );
    assert.doesNotMatch(
      css,
      /\.content-area\s*\{\s*padding:\s*10px;\s*\}/,
      'a padding shorthand must not erase the catalogue bottom clearance',
    );
  });

  it('provides touch-sized previous and next controls', async () => {
    const css = await readSource('src/index.css');

    assert.match(css, /\.pagination-bar \.text-action\s*\{[\s\S]*?min-height:\s*44px/);
    assert.match(css, /\.pagination-bar \.text-action\s*\{[\s\S]*?min-width:\s*96px/);
  });
});
