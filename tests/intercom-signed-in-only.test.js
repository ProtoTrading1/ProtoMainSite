import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const intercom = fs.readFileSync(new URL('../src/lib/intercom.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const root = fs.readFileSync(new URL('../src/Root.jsx', import.meta.url), 'utf8');

test('the Messenger is not loaded for anonymous visitors', () => {
  assert.doesNotMatch(main, /Intercom\(/, 'main.jsx no longer boots Intercom on page load');
  assert.match(intercom, /let loaded = false;/, 'load state is tracked');
  assert.match(intercom, /Intercom\(settings\(\{ intercom_user_jwt: token \}\)\)/,
    'the Messenger loads already identified, on first sign-in');
});

test('sign-out leaves nothing behind', () => {
  const reset = intercom.slice(intercom.indexOf('export function resetIntercom'));
  assert.match(reset, /shutdown\(\);/, 'the Messenger is shut down');
  assert.doesNotMatch(reset, /boot\(settings\(\)\)/, 'it is not re-booted anonymously');
});

test('the launcher is shown to signed-in customers, not on public pages', () => {
  assert.match(root, /const showLauncher = Boolean\(session\)/,
    'visibility keys off a real session, not merely "auth resolved"');
  assert.doesNotMatch(root, /isCatalogueSurface/,
    'the portal and profile no longer suppress the launcher');
});

test('visibility updates are safe before the Messenger loads', () => {
  const vis = intercom.slice(intercom.indexOf('export function setIntercomLauncherVisibility'));
  assert.match(vis, /if \(!loaded\) return;/);
});
