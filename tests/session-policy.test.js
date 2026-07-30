import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_MAX_AGE_DAYS,
  hasStoredSession,
  isSessionExpired,
  sessionDaysRemaining,
} from '../src/lib/sessionPolicy.js';

const NOW = Date.parse('2026-08-01T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();
const sessionSignedIn = (iso) => ({ user: { last_sign_in_at: iso } });

test('the sign-in window is 30 days', () => {
  assert.equal(SESSION_MAX_AGE_DAYS, 30);
});

test('a fresh sign-in survives a refresh', () => {
  assert.equal(isSessionExpired(sessionSignedIn(daysAgo(0)), NOW), false);
});

test('a sign-in inside the window is still valid', () => {
  assert.equal(isSessionExpired(sessionSignedIn(daysAgo(29.5)), NOW), false);
});

test('a sign-in past 30 days is expired', () => {
  assert.equal(isSessionExpired(sessionSignedIn(daysAgo(30.1)), NOW), true);
  assert.equal(isSessionExpired(sessionSignedIn(daysAgo(400)), NOW), true);
});

test('exactly 30 days is not yet expired', () => {
  assert.equal(isSessionExpired(sessionSignedIn(daysAgo(30)), NOW), false);
});

test('an undateable session is never force-signed-out', () => {
  // Throwing a customer out mid-order because a timestamp is missing or
  // malformed is worse than letting the server-side timebox catch it.
  assert.equal(isSessionExpired(sessionSignedIn(undefined), NOW), false);
  assert.equal(isSessionExpired(sessionSignedIn('not a date'), NOW), false);
  assert.equal(isSessionExpired({ user: {} }, NOW), false);
  assert.equal(isSessionExpired({}, NOW), false);
});

test('no session is not an expired session', () => {
  assert.equal(isSessionExpired(null, NOW), false);
  assert.equal(isSessionExpired(undefined, NOW), false);
});

test('a device clock behind the sign-in does not expire the session', () => {
  assert.equal(isSessionExpired(sessionSignedIn(daysAgo(-5)), NOW), false);
});

test('days remaining counts down and floors at zero', () => {
  assert.equal(sessionDaysRemaining(sessionSignedIn(daysAgo(0)), NOW), 30);
  assert.equal(sessionDaysRemaining(sessionSignedIn(daysAgo(25)), NOW), 5);
  assert.equal(sessionDaysRemaining(sessionSignedIn(daysAgo(30)), NOW), 0);
  assert.equal(sessionDaysRemaining(sessionSignedIn(daysAgo(99)), NOW), 0);
});

function fakeStorage(keys) {
  return { length: keys.length, key: (i) => keys[i] ?? null };
}

test('a persisted supabase session is detected', () => {
  assert.equal(hasStoredSession(fakeStorage(['sb-kyodrsqnmihwoplkhwwf-auth-token'])), true);
  assert.equal(hasStoredSession(fakeStorage(['proto-surface', 'sb-abc-auth-token'])), true);
});

test('unrelated storage keys are not mistaken for a session', () => {
  assert.equal(hasStoredSession(fakeStorage([])), false);
  assert.equal(hasStoredSession(fakeStorage(['proto-surface', 'cart'])), false);
  assert.equal(hasStoredSession(fakeStorage(['sb-abc-other'])), false);
});

test('storage that throws is treated as empty rather than crashing boot', () => {
  const hostile = { get length() { throw new Error('private browsing'); }, key: () => null };
  assert.equal(hasStoredSession(hostile), false);
});
