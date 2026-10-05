import test from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmedRecoveryMessage, createSignInAttemptGuard, isConfirmedSignInSession,
  signInFailureMessage, validateSignInFields,
} from '../src/lib/signInGuidance.mjs';

test('sign-in identifies missing email and password independently', () => {
  assert.deepEqual(validateSignInFields('', ''), {
    email: 'Enter your email address.', password: 'Enter your password.',
  });
  assert.deepEqual(Object.keys(validateSignInFields('synthetic@example.invalid', '')), ['password']);
  assert.deepEqual(Object.keys(validateSignInFields('   ', 'inert-password')), ['email']);
});

test('email format and size are checked without changing entered values', () => {
  for (const email of ['name', 'name@', '@example.invalid', 'name@example', 'a b@example.invalid', 'a@@example.invalid', `${'a'.repeat(255)}@example.invalid`]) {
    assert.match(validateSignInFields(email, 'inert').email, /valid email/);
  }
  for (const email of [' Synthetic+trade@Example.invalid ', 'name.surname@example.invalid']) {
    assert.deepEqual(validateSignInFields(email, 'inert'), {});
  }
});

test('recovery requires email alone and sign-in does not apply new registration password rules', () => {
  assert.deepEqual(validateSignInFields('synthetic@example.invalid', '', { mode: 'forgot' }), {});
  assert.deepEqual(validateSignInFields('synthetic@example.invalid', 'a'), {});
  assert.deepEqual(validateSignInFields('synthetic@example.invalid', ' '), {});
});

test('missing account, existing account and wrong password receive identical private guidance', () => {
  const cases = [
    { code: 'invalid_credentials', message: 'Invalid login credentials' },
    { code: 'user_not_found', status: 400, message: 'No account for synthetic@example.invalid' },
    { code: 'email_exists', status: 422, message: 'Existing account: synthetic@example.invalid' },
    { code: 'wrong_password', status: 401, message: 'Password wrong for known account' },
    { message: '<script>private provider diagnostic</script>' },
  ];
  const expected = signInFailureMessage(cases[0]);
  for (const error of cases) assert.equal(signInFailureMessage(error), expected);
  assert.match(expected, /Register for online access/);
  assert.match(expected, /Forgot password/);
  assert.doesNotMatch(expected, /example\.invalid|known account|provider|<script>/);
});

test('provider message alone cannot trigger account-specific confirmation or approval guidance', () => {
  const expected = signInFailureMessage({ code: 'invalid_credentials' });
  for (const message of ['Email not confirmed', 'Pending approval', 'Not approved', 'User does not exist']) {
    assert.equal(signInFailureMessage({ message }), expected);
  }
});

test('stable confirmation and approval errors explain next steps without claiming account existence', () => {
  assert.match(signInFailureMessage({ code: 'email_not_confirmed' }), /^If you recently registered,/);
  for (const code of ['pending_approval', 'not_approved', 'ACCOUNT_PENDING_APPROVAL']) {
    assert.match(signInFailureMessage({ code }), /If you have already applied,/);
  }
});

test('network, timeout, server and rate-limit failures have distinct fixed retry guidance', () => {
  assert.match(signInFailureMessage({ name: 'TypeError', message: 'Sensitive network information' }), /could not connect/);
  assert.match(signInFailureMessage({ name: 'AuthRetryableFetchError' }), /could not connect/);
  assert.match(signInFailureMessage({ code: 'REQUEST_TIMEOUT' }), /took too long/);
  assert.match(signInFailureMessage({ name: 'RequestTimeoutError' }), /took too long/);
  assert.match(signInFailureMessage({ status: 503 }), /temporarily unavailable/);
  assert.match(signInFailureMessage({ name: 'AuthRetryableFetchError', status: 503 }), /temporarily unavailable/);
  assert.match(signInFailureMessage({ status: 429 }), /wait a few minutes/);
  assert.match(signInFailureMessage({ code: 'over_request_rate_limit' }), /wait a few minutes/);
});

test('session-ownership and commit failures require a safe reload instead of invented success', () => {
  for (const code of ['SIGN_IN_SESSION_CHANGED', 'SIGN_IN_COMMIT_FAILED', 'SIGN_IN_INVALID_SESSION']) {
    assert.match(signInFailureMessage({ code }), /Reload this page/);
  }
});

test('recovery network or timeout describes unknown receipt and checks inbox before another request', () => {
  for (const operation of ['forgot', 'resend']) {
    for (const error of [{ code: 'REQUEST_TIMEOUT' }, { name: 'TypeError' }, { status: 0 }]) {
      const message = signInFailureMessage(error, { operation });
      assert.match(message, /could not confirm whether/);
      assert.match(message, /inbox and spam folder before requesting another/);
      assert.doesNotMatch(message, /was sent|account exists|account not found/);
    }
  }
});

test('recovery server and unknown errors do not echo internal messages or claim delivery', () => {
  for (const operation of ['forgot', 'resend']) {
    const result = signInFailureMessage({ status: 503, message: 'Account synthetic@example.invalid could not be found' }, { operation });
    assert.match(result, /try again later/);
    assert.doesNotMatch(result, /example\.invalid|could not be found|was sent/);
  }
});

test('generic recovery success requires confirmed receipt, without claiming email delivery', () => {
  for (const operation of ['forgot', 'resend']) {
    const message = confirmedRecoveryMessage({ ok: true }, operation);
    assert.match(message, /^Request received\. If /);
    assert.doesNotMatch(message, /sent|delivered|account found/);
    for (const result of [null, undefined, {}, { ok: false }, { ok: 'true' }, { success: true }]) {
      assert.throws(() => confirmedRecoveryMessage(result, operation), { code: 'INVALID_RESPONSE' });
    }
  }
});

test('sign-in success requires user identity and both nonempty session tokens', () => {
  const valid = { user: { id: 'synthetic-id' }, access_token: 'inert-access', refresh_token: 'inert-refresh' };
  assert.equal(isConfirmedSignInSession(valid), true);
  for (const session of [null, {}, { user: {} }, { ...valid, user: { id: '' } }, { ...valid, user: { id: 42 } },
    { ...valid, access_token: '' }, { ...valid, access_token: ' ' }, { ...valid, access_token: null },
    { ...valid, refresh_token: '' }, { ...valid, refresh_token: 123 }]) {
    assert.equal(isConfirmedSignInSession(session), false);
  }
});

test('attempt gate blocks double clicks and concurrent reset/resend calls synchronously', () => {
  const guard = createSignInAttemptGuard();
  assert.equal(guard.isBusy(), false);
  const attempt = guard.begin();
  assert.equal(guard.isBusy(), true);
  assert.equal(guard.begin(), null);
  assert.equal(guard.begin(), null);
  assert.equal(guard.isCurrent(attempt), true);
  assert.equal(guard.finish(attempt), true);
  assert.equal(guard.isBusy(), false);
  assert.notEqual(guard.begin(), attempt);
});

test('dismissal before commit aborts the request and suppresses a delayed outcome', async () => {
  const guard = createSignInAttemptGuard();
  const attempt = guard.begin();
  let complete;
  let accepted = false;
  const pending = new Promise((resolve) => { complete = resolve; }).then(() => {
    if (guard.isCurrent(attempt)) accepted = true;
  });
  assert.equal(guard.cancel(), true);
  assert.equal(attempt.controller.signal.aborted, true);
  complete(); await pending;
  assert.equal(accepted, false);
  assert.equal(guard.commit(attempt), false);
});

test('a cancelled or failed attempt cannot release the guard of a newer retry', () => {
  const guard = createSignInAttemptGuard();
  const first = guard.begin();
  guard.cancel();
  const retry = guard.begin();
  assert.equal(guard.finish(first), false);
  assert.equal(guard.isCurrent(retry), true);
  assert.equal(guard.isBusy(), true);
  assert.equal(guard.begin(), null);
  assert.equal(guard.finish(retry), true);
});

test('commit locks dismiss, mode changes and retries until the actual operation finishes', () => {
  const guard = createSignInAttemptGuard();
  const attempt = guard.begin();
  assert.equal(guard.commit(attempt), true);
  assert.equal(guard.cancel(), false);
  assert.equal(attempt.controller.signal.aborted, false);
  assert.equal(guard.begin(), null);
  assert.equal(guard.isCurrent(attempt), true);
  assert.equal(guard.finish(attempt), true);
  assert.equal(guard.cancel(), true);
});
