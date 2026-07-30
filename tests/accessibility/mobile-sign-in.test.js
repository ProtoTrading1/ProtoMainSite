import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('keeps the public sign-in action visible on mobile', async () => {
  const [landing, styles] = await Promise.all([
    readFile(new URL('../../src/pages/LandingPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/landing.css', import.meta.url), 'utf8'),
  ]);

  assert.match(landing, /className="access-nav-login"[^>]*>Sign in</);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*?\.access-nav \{[\s\S]*?display: flex;/);
  assert.match(styles, /\.access-nav > button:not\(\.access-nav-login\) \{\s*display: none;/);
  assert.doesNotMatch(styles, /@media \(max-width: 1100px\)[\s\S]*?\.access-nav \{\s*display: none;/);
});
