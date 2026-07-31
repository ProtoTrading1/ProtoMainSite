import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { accountCreationFailureResponse } from '../api/register-trade.js';
import { submitTradeApplication } from '../src/lib/tradeApplication.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('account creation failures provide a generic recovery response', () => {
  const response = accountCreationFailureResponse();

  assert.deepEqual(response, {
    error: 'We could not create a new account with these details. If you have registered before, sign in or use Forgot password. Otherwise, check your details and try again.',
    code: 'ACCOUNT_CREATION_FAILED',
    recovery: 'SIGN_IN_OR_RESET_PASSWORD',
  });
  assert.doesNotMatch(JSON.stringify(response), /already registered|user exists|duplicate/i);
});

test('registration client preserves structured recovery details', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: 'Generic failure',
    code: 'ACCOUNT_CREATION_FAILED',
    recovery: 'SIGN_IN_OR_RESET_PASSWORD',
  }), { status: 400, headers: { 'content-type': 'application/json' } }));

  await assert.rejects(
    submitTradeApplication({ email: 'customer@business.co.za' }),
    (error) => error.message === 'Generic failure'
      && error.code === 'ACCOUNT_CREATION_FAILED'
      && error.recovery === 'SIGN_IN_OR_RESET_PASSWORD',
  );
});

test('active registration journey offers a direct account-recovery action', () => {
  const source = read('src/pages/LandingPage.jsx');

  assert.match(source, /err\.recovery === 'SIGN_IN_OR_RESET_PASSWORD'/);
  assert.match(source, /Sign in or reset password/);
  assert.match(source, /className="lp-register-recovery-action" onClick=\{onLogin\}/);
  assert.match(source, /className="lp-quiz-error" role="alert"/);

  const styles = read('src/landing.css');
  assert.match(styles, /\.lp-register-recovery-action[\s\S]*min-height: 44px/);
  assert.match(styles, /\.lp-register-recovery-action:focus-visible[\s\S]*outline: 2px solid/);
});
