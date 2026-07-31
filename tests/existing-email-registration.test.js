import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('account creation failures provide recovery without exposing account existence', () => {
  const source = read('api/register-trade.js');

  assert.match(source, /SIGN_IN_OR_RESET_PASSWORD/);
  assert.match(source, /sign in or use Forgot password/);
  assert.doesNotMatch(source, /return res\.status\(400\)\.json\(\{ error: error\.message/);
  assert.match(source, /recovery response is returned for every account-creation failure/);
});

test('registration client preserves structured recovery details', () => {
  const source = read('src/lib/tradeApplication.js');

  assert.match(source, /error\.code = data\.code/);
  assert.match(source, /error\.recovery = data\.recovery/);
});

test('registration page offers a direct account-recovery action', () => {
  const source = read('src/pages/RegisterPage.jsx');

  assert.match(source, /submitErr\.recovery === 'SIGN_IN_OR_RESET_PASSWORD'/);
  assert.match(source, /Sign in or reset password/);
  assert.match(source, /className="lp-register-recovery-action" onClick=\{onLogin\}/);
});
