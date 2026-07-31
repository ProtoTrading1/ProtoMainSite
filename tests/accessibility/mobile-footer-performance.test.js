import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readSource = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
const publicUrl = (relativePath) => new URL(`../../public/${relativePath}`, import.meta.url);

describe('public mobile footer and image delivery', () => {
  it('keeps policy text compact while providing 44px touch targets', async () => {
    const page = await readSource('src/pages/LandingPage.jsx');
    const css = await readSource('src/landing.css');

    assert.match(page, /className="lp-footer-policy-links"/);
    assert.match(page, /className="lp-footer-policy-link"/);
    assert.match(
      css,
      /\.lp-footer-policy-link\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?font-size:\s*12px;/,
    );
    assert.match(css, /\.lp-footer-policy-link:focus-visible\s*\{/);
  });

  it('offers right-sized WebP brand artwork with a JPEG fallback', async () => {
    const component = await readSource('src/components/landing/LandingDepartmentsSection.jsx');
    const brandFiles = await readdir(publicUrl('brands/'));
    const smallWebps = brandFiles.filter((file) => file.endsWith('-180.webp'));
    const largeWebps = brandFiles.filter((file) => file.endsWith('-360.webp'));

    assert.match(component, /<picture>/);
    assert.match(component, /type="image\/webp"/);
    assert.match(component, /-180\.webp 180w,.*-360\.webp 360w/);
    assert.match(component, /sizes="180px"/);
    assert.match(component, /loading="lazy"/);
    assert.equal(smallWebps.length, 10);
    assert.equal(largeWebps.length, 10);

    const originalBytes = await Promise.all(
      brandFiles.filter((file) => file.endsWith('.jpg')).map(async (file) => (await stat(publicUrl(`brands/${file}`))).size),
    );
    const responsiveBytes = await Promise.all(
      [...smallWebps, ...largeWebps].map(async (file) => (await stat(publicUrl(`brands/${file}`))).size),
    );

    assert.ok(
      responsiveBytes.reduce((total, bytes) => total + bytes, 0)
        < originalBytes.reduce((total, bytes) => total + bytes, 0) / 4,
      'both responsive WebP sets together should stay below 25% of the original JPEG payload',
    );
  });

  it('uses a compact local logo icon before the large fallback', async () => {
    const brandAssets = await readSource('src/lib/brandAssets.js');
    const compactIcon = await stat(publicUrl('proto-trading-online-icon.webp'));
    const largeFallback = await stat(publicUrl('proto-logo.webp'));

    assert.match(
      brandAssets,
      /PROTO_ICON_SOURCES\s*=\s*\[\s*'\/proto-trading-online-icon\.webp'/,
    );
    assert.ok(compactIcon.size < largeFallback.size / 4);
  });
});
