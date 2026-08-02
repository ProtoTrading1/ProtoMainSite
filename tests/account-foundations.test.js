import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MIN_PASSWORD_LENGTH, passwordPolicyError } from '../src/lib/passwordPolicy.js';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('registration and password reset share one eight-character password policy', async () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.equal(passwordPolicyError('1234567'), 'Password must be at least 8 characters.');
  assert.equal(passwordPolicyError('12345678'), '');

  const [registrationApi, resetApi, resetPage] = await Promise.all([
    readSource('api/register-trade.js'),
    readSource('api/do-reset-password.js'),
    readSource('src/pages/ResetPasswordPage.jsx'),
  ]);
  assert.match(registrationApi, /passwordPolicyError\(password\)/);
  assert.match(resetApi, /passwordPolicyError\(password\)/);
  assert.match(resetPage, /minLength=\{MIN_PASSWORD_LENGTH\}/);
  assert.doesNotMatch(`${resetApi}\n${resetPage}`, /at least 6 characters/i);
});

test('reset form stays unavailable until the one-time link is validated', async () => {
  const [page, endpoint] = await Promise.all([
    readSource('src/pages/ResetPasswordPage.jsx'),
    readSource('api/validate-reset-token.js'),
  ]);

  assert.match(page, /fetch\('\/api\/validate-reset-token'/);
  assert.match(page, /tokenState === 'valid'/);
  assert.match(page, /Checking your reset link/);
  assert.match(endpoint, /getResetTokenVersion\(user\) !== claim\.v/);
  assert.match(endpoint, /invalid, expired, or has already been used/);
});

test('password reset consumes tokens atomically and revokes sessions before changing the password', async () => {
  const [resetApi, helper, migration, page] = await Promise.all([
    readSource('api/do-reset-password.js'),
    readSource('api/_password-reset.js'),
    readSource('migrations/060_password_reset_redemptions.sql'),
    readSource('src/pages/ResetPasswordPage.jsx'),
  ]);
  assert.match(resetApi, /consumeResetToken\(supabase, tokenHash, user\.id, claim\.exp\)/);
  assert.ok(resetApi.indexOf('await revokeUserSessions') < resetApi.indexOf('updateUserById'));
  assert.match(helper, /consume_password_reset_token/);
  assert.match(migration, /on conflict \(token_hash\) do nothing/);
  assert.match(page, /recoverySession/);
  assert.match(page, /signOut\(\{ scope: 'global' \}\)/);
});

test('account recovery is honest, preserves email and does not reveal account existence', async () => {
  const [modal, landing] = await Promise.all([
    readSource('src/components/LoginModal.jsx'),
    readSource('src/pages/LandingPage.jsx'),
  ]);

  assert.match(modal, /initialEmail = '', initialMode = 'login'/);
  assert.match(modal, /If an online account exists for that email/);
  assert.doesNotMatch(modal, /Password reset email sent/);
  assert.match(landing, /initialEmail: email\.trim\(\), initialMode: 'login'/);
  assert.match(landing, /initialEmail: email\.trim\(\), initialMode: 'forgot'/);
});

test('active registration journey starts directly with the form and requires business nature', async () => {
  const landing = await readSource('src/pages/LandingPage.jsx');

  assert.doesNotMatch(landing, /lp-account-choice/);
  assert.doesNotMatch(landing, /Bought from our physical store before\?/);
  assert.match(landing, /Step \{step \+ 1\} of \{STEP_LABELS\.length\}/);
  assert.match(landing, /aria-labelledby="landing-business-type-label" aria-required="true"/);
  assert.match(landing, /businessType\.length > 0/);
});

test('registration address controls have names, labels and accessible selection state', async () => {
  const addressFields = await readSource('src/components/register/BillingDeliveryFields.jsx');

  assert.match(addressFields, /htmlFor=\{inputId\(fieldKeys\.street\)\}/);
  assert.match(addressFields, /aria-required="true"/);
  assert.match(addressFields, /aria-pressed=\{buildingType === type\}/);
  assert.match(addressFields, /Use billing address for delivery/);
  assert.match(addressFields, /untick to enter a different address/);
});
