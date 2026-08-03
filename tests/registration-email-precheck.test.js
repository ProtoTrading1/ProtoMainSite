import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkRegistrationEmail } from '../src/lib/registrationEmailCheck.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('email precheck client returns structured availability', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ available: false, exists: true, recovery: 'SIGN_IN_OR_RESET_PASSWORD' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  const result = await checkRegistrationEmail(' Existing@Business.co.za ');
  assert.equal(result.exists, true);
  const [, request] = globalThis.fetch.mock.calls[0].arguments;
  assert.deepEqual(JSON.parse(request.body), { email: 'existing@business.co.za' });
});

test('server precheck is rate limited, server-side and returns no customer details', () => {
  const source = read('api/check-registration-email.js');
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(source, /registration-email-check:/);
  assert.match(source, /\.select\('id'\)/);
  assert.doesNotMatch(source, /is_approved|business_name|customer_code|phone/);
  assert.match(source, /available: !exists/);
});

test('both registration forms check on email blur and block existing accounts', () => {
  for (const path of ['src/pages/RegisterPage.jsx', 'src/pages/LandingPage.jsx']) {
    const source = read(path);
    assert.match(source, /onBlur=\{\(\) => \{ if \(email\.trim\(\)\) void checkEmailAvailability\(\); \}\}/);
    assert.match(source, /This email is already registered\./);
    assert.match(source, />Sign in</);
    assert.match(source, />Reset password</);
    assert.match(source, /emailCheck\.status === 'existing'/);
    assert.match(source, /sequence !== emailCheckSequence\.current/);
  }
});
