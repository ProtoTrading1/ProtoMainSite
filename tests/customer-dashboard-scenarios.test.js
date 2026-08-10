import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BASKET_ACTIVE,
  FIRST_LOGIN,
  RETURNING_BUYER,
  RETURNING_NO_ORDER,
  selectCustomerDashboardState,
} from '../src/lib/customerDashboardState.js';

const promptSourceUrl = new URL('../src/components/CustomerJourneyPrompt.jsx', import.meta.url);
const appSourceUrl = new URL('../src/App.jsx', import.meta.url);

const selectState = (overrides = {}) => selectCustomerDashboardState({
  basketRestoredAtLogin: false,
  basketItemCount: 0,
  firstLogin: false,
  onlineOrderCount: 0,
  firstName: 'George',
  ...overrides,
});

test('an active basket wins over every other customer signal and remains actionable', () => {
  const newCustomerWithBasket = selectState({
    basketRestoredAtLogin: true,
    basketItemCount: 3,
    firstLogin: true,
    onlineOrderCount: 0,
  });
  const orderedCustomerWithBasket = selectState({
    basketRestoredAtLogin: true,
    basketItemCount: 2,
    basketTotalInclVat: 1245,
    firstLogin: false,
    onlineOrderCount: 4,
  });

  for (const state of [newCustomerWithBasket, orderedCustomerWithBasket]) {
    assert.equal(state.key, BASKET_ACTIVE);
    assert.equal(state.eyebrow, 'YOUR BASKET');
    assert.match(state.title, /^Your basket is waiting, George$/);
    assert.equal(state.primaryLabel, 'Review basket');
    assert.equal(state.secondaryLabel, null);
    assert.equal(state.dismissAfterMs, null);
    assert.doesNotMatch(`${state.eyebrow} ${state.message}`, /saved/i);
  }
  assert.equal(newCustomerWithBasket.message, '3 items');
  assert.equal(orderedCustomerWithBasket.message, '2 items · R 1,245.00 incl. VAT');
});

test('an active basket uses singular item copy without introducing a second action', () => {
  const state = selectState({
    basketRestoredAtLogin: true,
    basketItemCount: 1,
    basketTotalInclVat: 239,
  });

  assert.equal(state.message, '1 item · R 239.00 incl. VAT');
  assert.equal(state.primaryLabel, 'Review basket');
  assert.equal(state.secondaryLabel, null);
});

test('items added during the current visit never masquerade as a restored basket', () => {
  const state = selectState({
    basketRestoredAtLogin: false,
    basketItemCount: 3,
    basketTotalInclVat: 450,
    onlineOrderCount: 2,
  });

  assert.equal(state.key, RETURNING_BUYER);
  assert.notEqual(state.presentation, 'basket');
});

test('an explicit first login receives first-name-only onboarding and no reorder content', () => {
  const state = selectState({ firstLogin: true });

  assert.equal(state.key, FIRST_LOGIN);
  assert.equal(state.title, 'Welcome to Proto Trading, George');
  assert.equal(state.primaryLabel, 'Browse catalogue');
  assert.equal(state.buyAgain, false);
  assert.equal(state.popularCategories, true);
  assert.doesNotMatch(`${state.title} ${state.message ?? ''}`, /account approved/i);
  assert.doesNotMatch(state.title, /Zitianellis/);
});

test('a returning customer with at least one order and an empty basket receives Buy Again', () => {
  const state = selectState({ onlineOrderCount: 1 });

  assert.equal(state.key, RETURNING_BUYER);
  assert.equal(state.title, 'Welcome back, George');
  assert.equal(state.buyAgain, true);
  assert.equal(state.popularCategories, false);
});

test('a returning customer with no orders and an empty basket receives discovery content', () => {
  const state = selectState();

  assert.equal(state.key, RETURNING_NO_ORDER);
  assert.equal(state.title, 'Welcome back, George');
  assert.equal(state.primaryLabel, 'Explore products');
  assert.equal(state.buyAgain, false);
  assert.equal(state.popularCategories, true);
});

test('an unavailable order history never makes a returning customer look like a first-time buyer', () => {
  const state = selectState({ orderHistoryAvailable: false });

  assert.equal(state.key, RETURNING_NO_ORDER);
  assert.equal(state.title, 'Welcome back, George');
  assert.equal(state.message, 'Good to see you again.');
  assert.equal(state.primaryLabel, 'Continue shopping');
  assert.equal(state.buyAgain, false);
  assert.equal(state.recentOrderEmpty, false);
  assert.doesNotMatch(`${state.title} ${state.message}`, /first order/i);
});

test('an existing online buyer never becomes a first login when firstLogin is false', () => {
  const state = selectState({
    firstLogin: false,
    onlineOrderCount: 8,
  });

  assert.equal(state.key, RETURNING_BUYER);
  assert.equal(state.title, 'Welcome back, George');
  assert.notEqual(state.key, FIRST_LOGIN);
});

test('missing and malformed lifecycle values fail safely to returning without an online order', () => {
  const inputs = [
    {},
    { firstLogin: 'true', onlineOrderCount: '8' },
    { firstLogin: 1, onlineOrderCount: true },
    { firstLogin: null, onlineOrderCount: Number.NaN },
    { firstLogin: undefined, onlineOrderCount: -3 },
    { firstLogin: false, onlineOrderCount: Number.POSITIVE_INFINITY },
  ];

  for (const input of inputs) {
    const state = selectState(input);
    assert.equal(state.key, RETURNING_NO_ORDER);
    assert.notEqual(state.key, FIRST_LOGIN);
  }
});

test('malformed basket values cannot override a valid returning buyer state', () => {
  for (const basketItemCount of ['2', true, Number.NaN, -1, Number.POSITIVE_INFINITY]) {
    const state = selectState({
      firstLogin: false,
      onlineOrderCount: 2,
      basketItemCount,
    });

    assert.equal(state.key, RETURNING_BUYER);
  }
});

test('the journey prompt keeps first-name copy and excludes retired approval/banner surfaces', async () => {
  const [prompt, app] = await Promise.all([
    readFile(promptSourceUrl, 'utf8'),
    readFile(appSourceUrl, 'utf8'),
  ]);

  assert.match(prompt, /state\.title/);
  assert.doesNotMatch(prompt, /fullName|lastName|account approved/i);
  assert.match(prompt, /Review basket/);
  assert.match(prompt, /presentation !== 'basket'/);
  assert.match(prompt, /role="status"/);
  assert.match(prompt, /aria-live="polite"/);
  assert.match(prompt, /aria-atomic="true"/);
  assert.match(prompt, /type="button"[\s\S]{0,120}onClick=\{onPrimary\}/);
  assert.doesNotMatch(prompt, /main-site-banner\.jpg|site-hero-banner/);
  assert.match(app, /addEventListener\('pointerdown', dismissAfterOutsideInteraction/);
  assert.doesNotMatch(app, /customerJourney\.presentation === 'basket'\) return undefined/);
  assert.equal(fs.existsSync(new URL('../public/main-site-banner.jpg', import.meta.url)), false);
});
