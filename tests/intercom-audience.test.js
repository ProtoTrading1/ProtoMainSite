import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Two audiences, one Messenger.
 *
 * A visitor who has not signed in gets the chat as an anonymous lead so they
 * can ask about trading hours, delivery and opening an account. A signed-in
 * customer gets a verified identity, which is the only thing that unlocks
 * stock and pricing. This file pins the boundary between them; it replaces
 * intercom-signed-in-only.test.js, which encoded the older policy of no chat
 * at all before login.
 */

const intercom = fs.readFileSync(new URL('../src/lib/intercom.js', import.meta.url), 'utf8');
const root = fs.readFileSync(new URL('../src/Root.jsx', import.meta.url), 'utf8');
const contact = fs.readFileSync(new URL('../api/intercom/_contact.js', import.meta.url), 'utf8');
const search = fs.readFileSync(new URL('../api/intercom/products/search.js', import.meta.url), 'utf8');

const fn = (name) => {
  const start = intercom.indexOf(`export ${name}`) >= 0
    ? intercom.indexOf(`export ${name}`)
    : intercom.indexOf(name);
  const next = intercom.indexOf('\n}', start);
  return intercom.slice(start, next + 2);
};

test('the first mount goes through the loader, not boot()', () => {
  const mount = fn('function mount');
  assert.match(mount, /if \(!loaded\) \{\s*Intercom\(settings\(extra\)\)/,
    'Intercom() injects the script; boot() alone leaves the page with no Messenger');
  assert.match(mount, /boot\(settings\(extra\)\)/, 're-identifying an already-loaded Messenger re-boots it');
});

test('a logged-out visitor is booted as an anonymous lead', () => {
  const ensure = fn('export function ensurePublicIntercom');
  assert.match(ensure, /mount\(\)/, 'the Messenger is put on the page');
  assert.doesNotMatch(ensure, /user_id|intercom_user_jwt/,
    'no identity is claimed for a visitor — that is what makes them a lead');
});

test('booting a visitor never clobbers an identified customer', () => {
  const ensure = fn('export function ensurePublicIntercom');
  assert.match(ensure, /if \(loaded \|\| identifiedUserId \|\| identifyInFlightFor\) return;/,
    'a customer mid-identify must not be downgraded to a lead by a re-render');
});

test('signed_in is the audience attribute on both sides', () => {
  assert.match(intercom, /const PUBLIC_ATTRIBUTES = \{ signed_in: false \}/);
  assert.match(intercom, /const CUSTOMER_ATTRIBUTES = \{ signed_in: true \}/);
  assert.match(intercom, /\.\.\.PUBLIC_ATTRIBUTES,/, 'the default boot is the public one');
  assert.match(intercom, /mount\(\{ intercom_user_jwt: token, \.\.\.CUSTOMER_ATTRIBUTES \}\)/,
    'a verified boot says so');
});

test('the launcher is shown across the customer-facing site', () => {
  // Including the trade sign-up host — a prospect mid-application is the
  // audience this chat exists for. Only the admin deployment is excluded.
  assert.match(root, /const publicSite = !adminHost;/);
  assert.match(root, /setIntercomLauncherVisibility\(publicSite\)/,
    'visitors and customers both get a chat button');
  assert.match(root, /if \(publicSite && session === null\) ensurePublicIntercom\(\)/,
    'the visitor boot waits for auth to resolve, so a returning customer is not booted twice');
});

test('sign-out drops the identity and falls back to a lead', () => {
  const reset = fn('export function resetIntercom');
  assert.match(reset, /identifiedUserId = null;/);
  assert.match(reset, /shutdown\(\);/, 'the previous customer must not survive on a shared machine');
  const shutdownIdx = reset.indexOf('shutdown();');
  const mountIdx = reset.indexOf('mount();');
  assert.ok(mountIdx > shutdownIdx, 'the anonymous re-boot happens after the shutdown, not instead of it');
});

test('an unverified session is never recorded as identified', () => {
  const identify = fn('async function identifyIntercom');
  const assignIdx = identify.indexOf('identifiedUserId = userId');
  const mountIdx = identify.indexOf('mount({ intercom_user_jwt: token');
  assert.ok(mountIdx > -1 && assignIdx > mountIdx,
    'identifiedUserId is only set after a signed mount, so a later event retries the upgrade');
});

test('a failed identity call still leaves the customer with a chat widget', () => {
  const identify = fn('async function identifyIntercom');
  assert.match(identify, /if \(!token\) \{\s*if \(!loaded\) mount\(\);/,
    'no token — mount unverified rather than leaving the page with no Messenger');
});

test('the catalogue connector refuses anyone without a verified user id', () => {
  assert.match(search, /requireVerifiedTradeContact/, 'the connector asks who is in the chat');
  const secretIdx = search.indexOf('requireIntercomSecret(req, res)');
  const contactIdx = search.indexOf('await requireVerifiedTradeContact(req, res)');
  const queryIdx = search.indexOf("const q = String(req.query.q");
  assert.ok(secretIdx > -1 && contactIdx > secretIdx, 'Intercom is authenticated before the contact is resolved');
  assert.ok(queryIdx > contactIdx, 'no catalogue work happens before the audience check');
});

test('a self-declared email is never accepted as a trade identity', () => {
  assert.match(contact, /req\.query\?\.user_id \|\| req\.query\?\.external_id/,
    'identity comes from the verified external_id');
  assert.doesNotMatch(contact, /req\.query\?\.email/,
    'a lead can type any address into the Messenger — it proves nothing');
});

test('the connector fails closed', () => {
  assert.match(contact, /if \(!userId \|\| !UUID\.test\(userId\)\) return refuse\(res\)/,
    'no id, or a junk id, gets the register prompt rather than the catalogue');
  assert.match(contact, /customer\.role !== 'admin' && customer\.is_approved !== true/,
    'an unapproved account is not a trade account');
  assert.match(contact, /res\.status\(503\)/, 'a database outage refuses rather than serves');
});

test('the refusal tells Fin what to say instead of looking broken', () => {
  assert.match(contact, /access: 'sign_in_required'/);
  assert.match(contact, /register at \$\{PUBLIC_SITE_URL\}/,
    'the prospect is pointed at registration on whichever host the portal currently uses');
  assert.match(contact, /res\.status\(200\)/,
    'Fin relays a tool message but treats an error status as a broken tool');
});
