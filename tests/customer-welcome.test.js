import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const mainContent = fs.readFileSync(new URL('../src/components/MainContent.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('the retired customer welcome surfaces cannot return', () => {
  assert.equal(fs.existsSync(new URL('../public/main-site-banner.jpg', import.meta.url)), false);
  assert.doesNotMatch(app, /CustomerWelcome/);
  assert.doesNotMatch(app, /Welcome back,/);
  assert.doesNotMatch(app, /WELCOME_(?:DISPLAY_MS|CAMPAIGN_ID|SEEN_KEY_PREFIX)/);
  assert.doesNotMatch(app, /showWelcome|dismissWelcome|welcomeSeenKey/);
  assert.doesNotMatch(mainContent, /showWelcome|site-hero-banner|main-site-banner\.jpg/);
  assert.doesNotMatch(styles, /\.customer-welcome/);
  assert.doesNotMatch(styles, /\.site-hero-banner|welcome-banner-brief/);
  assert.doesNotMatch(app, /components\/CustomerWelcome/);
});

test('approved customers land directly in the normal catalogue', () => {
  assert.doesNotMatch(mainContent, /Thank you for registering|Your account is now active|Start shopping now/i);
  assert.doesNotMatch(app, /proto_welcome_seen|trade-welcome-2026-08/);
  assert.doesNotMatch(app, /FirstLoginBuyingAssistant/);
  assert.doesNotMatch(styles, /buying-assistant/);
});
