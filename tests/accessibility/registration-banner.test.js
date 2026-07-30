import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the registration banner sends every customer to the re-registration form', async () => {
  const source = await readFile(new URL('../../src/pages/RegisterPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /id="trade-registration-form"/);
  assert.match(source, /src="\/register-reregister-banner\.webp\?v=2"/);
  assert.match(source, /Existing customers must re-register/);
  assert.match(source, /New customers can apply for Proto Trading Online access/);
  assert.match(source, /does not create an account at our physical store/);
  assert.match(source, /New applications are reviewed before online access is approved/);
  assert.match(source, /getElementById\('trade-registration-form'\)\?\.scrollIntoView/);
  assert.match(source, /standaloneStep === 0 && registrationBanner/);
  assert.match(source, /\{registrationBanner\}\s*<div className="lp-register-shell">/);
  assert.doesNotMatch(source, /Instant approval for new trade customers/);
  assert.doesNotMatch(source, /enjoy 7\.5% off your first online order/);
});