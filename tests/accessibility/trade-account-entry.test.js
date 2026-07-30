import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('uses one clear label for each trade-account journey', async () => {
  const [landing, login, register] = await Promise.all([
    readSource('src/pages/LandingPage.jsx'),
    readSource('src/components/LoginModal.jsx'),
    readSource('src/pages/RegisterPage.jsx'),
  ]);

  assert.match(landing, />Apply for a trade account</);
  assert.match(landing, />Sign in</);
  assert.match(login, /Sign in to your trade account/);
  assert.match(login, /Apply for a trade account/);
  assert.match(register, /Submit trade application/);

  const customerCopy = `${landing}\n${login}\n${register}`;
  assert.doesNotMatch(customerCopy, />Log in</);
  assert.doesNotMatch(customerCopy, /Create trade account/);
  assert.doesNotMatch(customerCopy, /Apply for access/);
});
