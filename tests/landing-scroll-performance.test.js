import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const landingSource = fs.readFileSync(
  new URL('../src/pages/LandingPage.jsx', import.meta.url),
  'utf8',
);
const landingStyles = fs.readFileSync(
  new URL('../src/landing.css', import.meta.url),
  'utf8',
);

test('landing journey progress is event-driven and keeps the native scrollbar', () => {
  assert.match(landingSource, /addEventListener\('scroll', scheduleUpdate/);
  assert.match(landingSource, /requestAnimationFrame\(updateProgress\)/);
  assert.doesNotMatch(landingSource, /function tick\(/);
  assert.doesNotMatch(landingSource, /hide-native-scrollbar/);
  assert.doesNotMatch(landingStyles, /html\.proto-journey-active/);
});

test('landing journey decoration respects reduced motion and stays non-interactive', () => {
  assert.match(landingSource, /prefers-reduced-motion: reduce/);
  assert.match(landingSource, /aria-hidden="true"/);
  assert.match(landingStyles, /pointer-events: none/);
  assert.match(landingStyles, /\(prefers-reduced-motion: reduce\)/);
});
