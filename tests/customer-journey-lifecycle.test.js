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
    /const firstPortalLogin = isExplicitFirstPortalLogin\(customer\)[\s\S]{0,500}firstLogin:\s*firstPortalLogin/,
  );
  assert.doesNotMatch(dashboardState, /portal_welcome_seen_at|welcome_seen_at|invoice_count/);
});

test('the first welcome is recorded server-side and in-session as soon as it is selected', () => {
  assert.match(app, /markPortalWelcomeSeen/);
  assert.match(
    app,
    /const firstPortalLogin = isExplicitFirstPortalLogin\(customer\)[\s\S]{0,900}rememberJourneyThisLogin\(customer\.id, loginSessionKey\)[\s\S]{0,300}if \(firstPortalLogin\)[\s\S]{0,200}markPortalWelcomeSeen/,
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

test('a restored basket cannot defer the one-time first-login marker to a later visit', () => {
  assert.match(app, /firstLogin:\s*firstPortalLogin/);
  assert.match(app, /if \(firstPortalLogin\)[\s\S]{0,200}markPortalWelcomeSeen/);
  assert.doesNotMatch(app, /nextJourney\.key === FIRST_LOGIN/);
});

test('online buyer status comes only from fetched web order history', () => {
  assert.doesNotMatch(app, /customer\?\.invoice_count|customer\.invoice_count/);
  assert.match(app, /onlineOrderCount:\s*lastOrder\s*\?\s*1\s*:\s*0/);
  assert.match(app, /fetchLastOrder/);
  assert.match(app, /orderHistoryResolved/);
});

test('an order-history failure falls back to neutral returning copy', () => {
  assert.match(app, /const \[orderHistoryAvailable, setOrderHistoryAvailable\]/);
  assert.match(
    app,
    /fetchLastOrder\(customer\.id\)[\s\S]{0,500}setOrderHistoryAvailable\(true\)[\s\S]{0,300}\.catch\([\s\S]{0,180}setOrderHistoryAvailable\(false\)/,
  );
  assert.match(app, /orderHistoryAvailable,\s*\n\s*basketRestoredAtLogin/);
  assert.match(dashboardState, /if \(orderHistoryAvailable !== true\)[\s\S]{0,500}Good to see you again\./);
  assert.doesNotMatch(
    dashboardState.slice(dashboardState.indexOf('if (orderHistoryAvailable !== true)')),
    /Ready to place your first order\?[\s\S]{0,200}orderHistoryAvailable/,
  );
});

test('only an untouched basket restored during login wins over welcome states', () => {
  assert.match(app, /if \(!customer\?\.id \|\| !cartHydrated \|\| !orderHistoryResolved\) return/);
  assert.match(app, /setLoginBasketSnapshot\(\{[\s\S]{0,500}fingerprint:[\s\S]{0,250}itemCount:[\s\S]{0,250}totalInclVat:/);
  assert.match(app, /restoredBasketIsUntouched[\s\S]{0,500}loginBasketSnapshot\.fingerprint === cartFingerprint\(cartItems\)/);
  assert.match(app, /basketRestoredAtLogin:\s*restoredBasketIsUntouched/);
  assert.match(dashboardState, /basketRestoredAtLogin === true && basketItems > 0[\s\S]{0,180}key:\s*BASKET_ACTIVE/);
  assert.doesNotMatch(app, /main-site-banner\.jpg|site-hero-banner|CustomerWelcome/);
  assert.equal(fs.existsSync(new URL('../public/main-site-banner.jpg', import.meta.url)), false);
});

test('normal shopping interaction collapses the basket reminder back to persistent cart controls', () => {
  assert.match(app, /if \(!customerJourney\) return undefined;[\s\S]{0,350}dismissAfterOutsideInteraction/);
  assert.doesNotMatch(app, /customerJourney\.presentation === 'basket'\) return undefined/);
  assert.match(app, /event\.target\?\.closest\?\.\('\.customer-journey-prompt'\)/);
});

test('meaningful scrolling or changing the restored basket dismisses its reminder', () => {
  assert.match(app, /BASKET_REMINDER_SCROLL_DISMISS_PX = 96/);
  assert.match(
    app,
    /customerJourney\?\.presentation !== 'basket'[\s\S]{0,1200}addEventListener\('scroll', dismissAfterMeaningfulScroll/,
  );
  assert.match(
    app,
    /Math\.abs\(currentPosition - \(initialPositions\.get\(target\) \|\| 0\)\) < BASKET_REMINDER_SCROLL_DISMISS_PX/,
  );
  assert.match(
    app,
    /cartFingerprint\(cartItems\) === loginBasketSnapshot\.fingerprint[\s\S]{0,150}dismissCustomerJourney\(null, \{ animate: true \}\)/,
  );
  assert.match(app, /CUSTOMER_JOURNEY_EXIT_MS = 180/);
});
