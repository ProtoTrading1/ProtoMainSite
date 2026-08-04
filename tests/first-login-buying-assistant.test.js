import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const component = fs.readFileSync(new URL('../src/components/FirstLoginBuyingAssistant.jsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../api/buying-assistant.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/064_customer_buying_assistant.sql', import.meta.url), 'utf8');

test('approved customers receive one optional first-login buying assistant', () => {
  assert.match(app, /FirstLoginBuyingAssistant/);
  assert.match(component, /See proven sellers/);
  assert.match(component, /Find current specials/);
  assert.match(component, /Browse the full catalogue/);
  assert.match(component, /Skip — I know where I’m going/);
});

test('assistant completion is private, minimal and never changes customer access', () => {
  assert.match(api, /requireApprovedCustomer/);
  assert.match(api, /GOALS/);
  assert.doesNotMatch(api, /is_approved|tier|price|order/);
  assert.match(migration, /revoke all .* anon, authenticated/);
  assert.match(migration, /never controls access, pricing or customer approval/);
});
