import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ONE_DAY_MS,
  THREE_DAY_MS,
  basketLifecycle,
  buildBasketReminderEmail,
  nextBasketLifecycle,
  reminderDue,
} from '../lib/basket-expiry.mjs';

const NOW = Date.parse('2026-08-14T10:00:00.000Z');
const items = [{
  qty: 4,
  product: { sku: 'MUG514-BLK', name: 'Ceramic Mug Black', price: 42.5 },
}];

test('a new basket receives seven days', () => {
  const next = nextBasketLifecycle(null, items, NOW);
  assert.equal(Date.parse(next.expires_at) - NOW, 7 * ONE_DAY_MS);
  assert.equal(next.extension_used, false);
});

test('an early basket change keeps the original deadline', () => {
  const row = {
    items,
    started_at: new Date(NOW - ONE_DAY_MS).toISOString(),
    expires_at: new Date(NOW + 5 * ONE_DAY_MS).toISOString(),
    extension_used: false,
  };
  const next = nextBasketLifecycle(row, items, NOW);
  assert.equal(next.expires_at, row.expires_at);
  assert.equal(next.extension_used, false);
});

test('a genuine final-window change grants one three-day extension', () => {
  const row = {
    items,
    started_at: new Date(NOW - 5 * ONE_DAY_MS).toISOString(),
    expires_at: new Date(NOW + 2 * ONE_DAY_MS).toISOString(),
    extension_used: false,
    reminder_3d_sent_at: new Date(NOW - ONE_DAY_MS).toISOString(),
    reminder_1d_sent_at: new Date(NOW - 1000).toISOString(),
  };
  const next = nextBasketLifecycle(row, items, NOW);
  assert.equal(Date.parse(next.expires_at) - NOW, THREE_DAY_MS);
  assert.equal(next.extension_used, true);
  assert.equal(next.reminder_3d_sent_at, row.reminder_3d_sent_at);
  assert.equal(next.reminder_1d_sent_at, null);

  const second = nextBasketLifecycle({ ...row, ...next }, items, NOW + ONE_DAY_MS);
  assert.equal(second.expires_at, next.expires_at);
  assert.equal(second.extension_used, true);
});

test('reminders are due at three days and one day only once', () => {
  const row = {
    items,
    started_at: new Date(NOW - 4 * ONE_DAY_MS).toISOString(),
    expires_at: new Date(NOW + THREE_DAY_MS).toISOString(),
  };
  assert.equal(reminderDue(row, NOW), '3d');
  assert.equal(reminderDue({ ...row, reminder_3d_sent_at: new Date().toISOString() }, NOW), null);
  assert.equal(reminderDue({ ...row, expires_at: new Date(NOW + ONE_DAY_MS).toISOString() }, NOW), '1d');
  assert.equal(reminderDue({ ...row, expires_at: new Date(NOW - 1).toISOString() }, NOW), 'expired');
});

test('Proto email renders customer-safe wording and basket facts', () => {
  const email = buildBasketReminderEmail({
    customerName: 'George Example',
    items,
    kind: '1d',
    expiresAt: new Date(NOW + ONE_DAY_MS).toISOString(),
    basketUrl: 'https://proto.co.za/?open=basket',
  });
  assert.equal(email.subject, 'Your Proto Trading basket expires tomorrow');
  assert.match(email.html, /PROTO <span[^>]*>TRADING/);
  assert.match(email.html, /Hi George/);
  assert.match(email.html, /Ceramic Mug Black/);
  assert.match(email.html, /MUG514-BLK/);
  assert.match(email.html, /Return to my basket/);
  assert.match(email.html, /does not reserve stock or guarantee prices/);
  assert.doesNotMatch(email.html, /GRV/i);
});

test('worker is scheduled but remains feature-flagged and authenticated', async () => {
  const [worker, vercel] = await Promise.all([
    readFile(new URL('../api/basket-expiry-sweep.js', import.meta.url), 'utf8'),
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  ]);
  assert.match(worker, /BASKET_EXPIRY_EMAILS_ENABLED !== 'true'/);
  assert.match(worker, /BASKET_EXPIRY_ENABLED !== 'true'/);
  assert.match(worker, /CRON_SECRET/);
  assert.match(worker, /Idempotency-Key/);
  assert.match(vercel, /basket-expiry-sweep/);
});

test('legacy rows derive an initial deadline from activity time', () => {
  const state = basketLifecycle({ items, activity_at: NOW - ONE_DAY_MS }, NOW);
  assert.equal(state.remainingMs, 6 * ONE_DAY_MS);
});
