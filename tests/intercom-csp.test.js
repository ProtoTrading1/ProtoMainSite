import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const csp = vercel.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key.toLowerCase() === 'content-security-policy').value;

const directive = (name) => (csp.split(';').map((s) => s.trim())
  .find((s) => s.startsWith(`${name} `)) || '');

/**
 * The Messenger renders inside an iframe served from
 * intercom-messenger-frames.intercomcdn.com, and pulls its own scripts and
 * styles from other *.intercomcdn.com subdomains. Allowing only
 * js.intercomcdn.com let the launcher work while the panel opened blank.
 */
test('the Messenger iframe host is allowed', () => {
  assert.match(directive('frame-src'), /https:\/\/\*\.intercomcdn\.com/);
});

test('Messenger scripts and styles are allowed', () => {
  assert.match(directive('script-src'), /https:\/\/\*\.intercomcdn\.com/);
  assert.match(directive('style-src'), /https:\/\/\*\.intercomcdn\.com/);
});

test('blob workers are allowed, since default-src self would block them', () => {
  assert.match(directive('worker-src'), /'self' blob:/);
});

test('the page still refuses to be framed', () => {
  assert.match(directive('frame-ancestors'), /'none'/);
});
