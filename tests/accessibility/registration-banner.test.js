import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the registration banner sends every customer to the re-registration form', async () => {
  const source = await readFile(new URL('../../src/pages/RegisterPage.jsx', import.meta.url), 'utf8');

  assert.match(source, /id="trade-registration-form"/);
  assert.match(source, /src="\/register-reregister-banner\.webp\?v=1"/);
  assert.match(source, /All customers must re-register for the new website/);
  assert.match(source, /getElementById\('trade-registration-form'\)\?\.scrollIntoView/);
  assert.doesNotMatch(source, /enjoy 7\.5% off your first online order/);
});
