import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('uses one clear label for each trade-account journey', async () => {
  const [landing, hero, login, register, landingStyles] = await Promise.all([
    readSource('src/pages/LandingPage.jsx'),
    readSource('src/components/landing/LandingHero.jsx'),
    readSource('src/components/LoginModal.jsx'),
    readSource('src/pages/RegisterPage.jsx'),
    readSource('src/landing.css'),
  ]);

  assert.match(landing, />Sign in</);
  assert.match(hero, /Apply for Online Access/);
  assert.match(hero, /ArrowDown/);
  assert.match(hero, /Previous online customers must /);
  assert.match(hero, /Online approval applies to website purchases only and does not create an in-store account\./);
  assert.doesNotMatch(hero, /Existing customers must /);
  assert.doesNotMatch(hero, /Apply for a Trade Account/);
  assert.doesNotMatch(hero, /Sign In/);
  assert.doesNotMatch(hero, /onLogin/);
  assert.match(landingStyles, /\.vhero-copy\s*{[\s\S]*?padding: 52px 20px 36px;[\s\S]*?gap: 26px;/);
  assert.match(landingStyles, /\.vhero-support-note\s*{[\s\S]*?color: #c4c4cc;/);
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
