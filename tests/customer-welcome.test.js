import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('the temporary welcome leaves no permanent dashboard strip behind', () => {
  assert.doesNotMatch(app, /CustomerWelcome/);
  assert.doesNotMatch(app, /Welcome back,/);
  assert.doesNotMatch(styles, /\.customer-welcome/);
  assert.doesNotMatch(app, /components\/CustomerWelcome/);
});

test('the welcome is account-scoped, campaign-scoped and remembered on this device', () => {
  assert.match(app, /const WELCOME_CAMPAIGN_ID = 'trade-welcome-2026-08'/);
  assert.match(app, /localStorage\.getItem\(welcomeSeenKey\(accountId\)\)/);
  assert.match(app, /localStorage\.setItem\(welcomeSeenKey\(customerId\)/);
  assert.match(app, /if \(!accountId\) return false/);
  assert.doesNotMatch(app, /sessionStorage\.setItem\(WELCOME_DISMISSED_KEY/);
  assert.doesNotMatch(app, /setShowWelcome\(true\)/);
  assert.doesNotMatch(app, /FirstLoginBuyingAssistant/);
  assert.doesNotMatch(styles, /buying-assistant/);
});
