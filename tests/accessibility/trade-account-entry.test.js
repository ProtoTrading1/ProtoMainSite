import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('uses one clear label for each trade-account journey', async () => {
  const [landing, hero, login, register] = await Promise.all([
    readSource('src/pages/LandingPage.jsx'),
    readSource('src/components/landing/LandingHero.jsx'),
    readSource('src/components/LoginModal.jsx'),
    readSource('src/pages/RegisterPage.jsx'),
  ]);

  assert.match(landing, />Sign in</);
  // The hero asks which journey the visitor is on and gives each one label.
  assert.match(hero, /What would you like to do\?/);
  assert.match(hero, /Registered on our old website\?/);
  assert.match(hero, /Your old login will not work here\./);
  assert.match(hero, /Register again/);
  assert.match(hero, /New to Proto Trading online\?/);
  assert.match(hero, /Apply for online access/);
  assert.doesNotMatch(hero, /Existing customers must /);
  assert.doesNotMatch(hero, /Sign In/);
  assert.doesNotMatch(hero, /onLogin/);
  assert.match(login, /Sign in to your trade account/);
  assert.match(login, /Bought from Proto before, but not online\?/);
  assert.match(login, /New trade customer\?/);
  assert.match(login, /Re-register or apply/);
  assert.match(register, /Submit trade application/);

  const customerCopy = `${landing}\n${hero}\n${login}\n${register}`;
  assert.doesNotMatch(customerCopy, />Log in</);
  assert.doesNotMatch(customerCopy, /Create trade account/);
  assert.doesNotMatch(customerCopy, /Apply for access/);
});
