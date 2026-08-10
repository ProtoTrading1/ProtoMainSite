import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = fs.readFileSync(new URL('../src/Root.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dashboardState = fs.readFileSync(
  new URL('../src/lib/customerDashboardState.js', import.meta.url),
  'utf8',
);

test('Root gives App a stable Supabase login key based on last_sign_in_at', () => {
  assert.match(
    root,
    /<App[\s\S]{0,800}loginSessionKey=\{session\?\.user\?\.last_sign_in_at[^}]*\}/,
  );
  assert.match(app, /export default function App\(\{[\s\S]{0,400}loginSessionKey/);
});

test('the remount marker is scoped to both account and login session', () => {
  assert.match(app, /CUSTOMER_JOURNEY_SESSION_KEY_PREFIX/);
  assert.match(
    app,
    /function customerJourneySessionKey\(customerId, loginSessionKey\)[\s\S]{0,500}customerId[\s\S]{0,200}loginSessionKey/,
  );
  assert.match(app, /hasShownJourneyThisLogin\(customer\.id, loginSessionKey\)/);
  assert.match(app, /const key = customerJourneySessionKey\(customerId, loginSessionKey\)[\s\S]{0,160}sessionStorage\.getItem\(key\)/);
  assert.match(app, /const key = customerJourneySessionKey\(customerId, loginSessionKey\)[\s\S]{0,220}sessionStorage\.setItem\(key, '1'\)/);
  assert.doesNotMatch(app, /localStorage\.setItem\(`\$\{CUSTOMER_JOURNEY_(?:SEEN|SESSION)_KEY_PREFIX/);
});

test('first login fails safe when the profile cannot expose portal_welcome_seen_at', () => {
  assert.match(
    app,
    /Object\.prototype\.hasOwnProperty\.call\(customer, 'portal_welcome_seen_at'\)/,
  );
  assert.match(app, /customer\.portal_welcome_seen_at === null/);
  assert.doesNotMatch(app, /customer\?\.welcome_seen_at/);
  assert.doesNotMatch(app, /if \(!customer\?\.portal_welcome_seen_at\)/);
});

test('FIRST_LOGIN is selected only from an explicit null server column', () => {
  assert.match(app, /isExplicitFirstPortalLogin[\s\S]{0,500}portal_welcome_seen_at === null/);
  assert.match(
    app,
    /firstLogin:\s*isExplicitFirstPortalLogin\(customer\)/,
  );
  assert.doesNotMatch(dashboardState, /portal_welcome_seen_at|welcome_seen_at|invoice_count/);
});

test('the first welcome is recorded server-side and in-session as soon as it is selected', () => {
  assert.match(app, /markPortalWelcomeSeen/);
  assert.match(
    app,
    /selectCustomerDashboardState[\s\S]{0,700}rememberJourneyThisLogin\(customer\.id, loginSessionKey\)[\s\S]{0,300}nextJourney\.key === FIRST_LOGIN[\s\S]{0,200}markPortalWelcomeSeen/,
  );
  assert.match(
    app,
    /selectCustomerDashboardState[\s\S]{0,700}setCustomerJourney\(nextJourney\)/,
  );
  assert.doesNotMatch(
    app,
    /dismissCustomerJourney[\s\S]{0,350}current\?\.key === FIRST_LOGIN[\s\S]{0,200}markPortalWelcomeSeen/,
  );
});

test('online buyer status comes only from fetched web order history', () => {
  assert.doesNotMatch(app, /customer\?\.invoice_count|customer\.invoice_count/);
  assert.match(app, /onlineOrderCount:\s*lastOrder\s*\?\s*1\s*:\s*0/);
  assert.match(app, /fetchLastOrder/);
  assert.match(app, /orderHistoryResolved/);
});

test('an active hydrated basket wins and legacy welcome surfaces remain retired', () => {
  assert.match(app, /if \(!customer\?\.id \|\| !cartHydrated \|\| !orderHistoryResolved\) return/);
  assert.match(app, /basketItemCount:\s*totalItemCount/);
  assert.match(dashboardState, /if \(basketItems > 0\)[\s\S]{0,180}key:\s*BASKET_ACTIVE/);
  assert.doesNotMatch(app, /main-site-banner\.jpg|site-hero-banner|CustomerWelcome/);
  assert.equal(fs.existsSync(new URL('../public/main-site-banner.jpg', import.meta.url)), false);
});
