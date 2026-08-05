import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const intercom = fs.readFileSync(new URL('../src/lib/intercom.js', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const root = fs.readFileSync(new URL('../src/Root.jsx', import.meta.url), 'utf8');

const fn = (name) => {
  const start = intercom.indexOf(`export ${name}`) >= 0
    ? intercom.indexOf(`export ${name}`)
    : intercom.indexOf(name);
  const next = intercom.indexOf('\n}', start);
  return intercom.slice(start, next + 2);
};

test('the Messenger is not loaded for anonymous visitors', () => {
  assert.doesNotMatch(main, /Intercom\(/, 'main.jsx no longer boots Intercom on page load');
  assert.match(intercom, /let loaded = false;/, 'load state is tracked');
});

test('the first mount goes through the loader, not boot()', () => {
  const mount = fn('function mount');
  assert.match(mount, /if \(!loaded\) \{\s*Intercom\(settings\(extra\)\)/,
    'Intercom() injects the script; boot() alone leaves the page with no Messenger');
  assert.match(mount, /boot\(settings\(extra\)\)/, 're-identifying an already-loaded Messenger re-boots it');
});

test('a signed identity is applied when one is available', () => {
  assert.match(intercom, /mount\(\{ intercom_user_jwt: token \}\)/,
    'the JWT is handed to the Messenger so Intercom treats the email as verified');
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

/**
 * The identity endpoint is a hard dependency of the *verified* experience, and
 * it used to be a hard dependency of having any chat at all: a 503 (secret not
 * configured), 403 (account not approved yet) or 429 answered with `null`,
 * identifyIntercom returned early, and nothing was ever put on the page — so
 * "Ask Proto" threw into the console and the launcher never appeared.
 */
test('a failed identity call still leaves the customer with a chat widget', () => {
  const identify = fn('async function identifyIntercom');
  assert.match(identify, /if \(!token\) \{\s*if \(!loaded\) mount\(\);/,
    'no token — mount unverified rather than leaving the page with no Messenger');
  assert.doesNotMatch(identify, /if \(!token\) return false;/,
    'the bare early return is what removed the widget entirely');
});

test('an unverified session is never recorded as identified', () => {
  const identify = fn('async function identifyIntercom');
  const assignIdx = identify.indexOf('identifiedUserId = userId');
  const mountIdx = identify.indexOf('mount({ intercom_user_jwt: token })');
  assert.ok(mountIdx > -1 && assignIdx > mountIdx,
    'identifiedUserId is only set after a signed mount, so a later event retries the upgrade');
});

test('a token refresh retries identification when the tab never got verified', () => {
  const refresh = fn('async function refreshIntercomIdentity');
  assert.match(refresh, /if \(!identifiedUserId \|\| session\?\.user\?\.id !== identifiedUserId\) \{\s*return identifyIntercom\(session\)/,
    'a long-lived tab gets another chance instead of staying unverified forever');
});

test('the chat button loads the Messenger on demand', () => {
  const open = fn('export function openIntercom');
  assert.match(open, /if \(!loaded\) mount\(\);/);
  assert.match(open, /show\(\);/);
});

test('an unavailable identity endpoint is reported, not swallowed', () => {
  const fetchToken = fn('async function fetchIdentityToken');
  assert.match(fetchToken, /console\.warn/, 'the HTTP status is logged so the cause is diagnosable');
  assert.match(fetchToken, /res\.status/);
});
