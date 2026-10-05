import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkRegistrationEmail } from '../src/lib/registrationEmailCheck.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('email precheck client returns structured syntax-only receipt', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ ok: true, validationOnly: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  const result = await checkRegistrationEmail(' Existing@Business.co.za ');
  assert.equal(result.validationOnly, true);
  const [, request] = globalThis.fetch.mock.calls[0].arguments;
  assert.deepEqual(JSON.parse(request.body), { email: 'existing@business.co.za' });
});

test('server precheck is rate limited and makes no account lookup', () => {
  const source = read('api/check-registration-email.js');
  assert.match(source, /registration-email-check:/);
  assert.match(source, /validationOnly: true/);
  assert.doesNotMatch(source, /createClient|SUPABASE_SERVICE_ROLE_KEY|\.from\(|available:|exists:/);
});

test('both registration forms keep sequence guards and make successful email checks silent', () => {
  for (const path of ['src/pages/RegisterPage.jsx', 'src/pages/LandingPage.jsx']) {
    const source = read(path);
    assert.match(source, /validationOnly !== true/);
    assert.doesNotMatch(source, /Email format checked/);
    assert.match(source, /status: 'available', checkedEmail: normalized, message: ''/);
    assert.match(source, /\['checking', 'error'\]\.includes\(emailCheck\.status\)/);
    assert.doesNotMatch(source, /This email is already registered\./);
    assert.match(source, /sequence !== emailCheckSequence\.current/);
  }
});
