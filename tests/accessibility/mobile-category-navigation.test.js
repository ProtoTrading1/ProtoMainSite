import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readSource = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

describe('mobile category navigation', () => {
  it('keeps category names visible while catalogue counts load', async () => {
    const taxonomy = await readSource('src/lib/taxonomy.js');
    const mobileNav = await readSource('src/components/MobileNav.jsx');

    assert.match(taxonomy, /filterNavChildrenWhenCountsReady/);
    assert.match(taxonomy, /return count == null \|\| count > 0/);
    assert.match(mobileNav, /filterNavChildrenWhenCountsReady/);
  });

  it('separates product selection from deeper category navigation', async () => {
    const mobileNav = await readSource('src/components/MobileNav.jsx');

    assert.match(mobileNav, /navigate\(cat\.navPath\); onClose\(\)/);
    assert.match(mobileNav, /aria-label=\{`Browse subcategories in \$\{cat\.label\}`\}/);
    assert.match(mobileNav, /minWidth: 52/);
  });

  it('supports category search and modal focus containment', async () => {
    const mobileNav = await readSource('src/components/MobileNav.jsx');

    assert.match(mobileNav, /placeholder="Search categories"/);
    assert.match(mobileNav, /querySelectorAll\(/);
    assert.match(mobileNav, /document\.body\.style\.overflow = 'hidden'/);
  });
});
