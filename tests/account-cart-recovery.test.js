import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { boundedCartRequest } from '../src/lib/accountCartRequest.mjs';
import { cartSyncFailure } from '../src/lib/cartSyncRecovery.mjs';

test('a stalled basket request terminates and aborts its connection', async () => {
  let signal;
  await assert.rejects(boundedCartRequest((value) => {
    signal = value;
    return new Promise(() => {});
  }, 10), { code: 'cart_timeout' });
  assert.equal(signal.aborted, true);
});

test('successful recovery preserves every line and quantity', async () => {
  const basket = { items: [{ product: { id: 'ONE' }, qty: 15 }], revision: 9 };
  assert.equal(await boundedCartRequest(async () => basket, 100), basket);
});

test('validation errors survive without a silent empty-basket fallback', async () => {
  const error = Object.assign(new Error('Invalid basket'), { status: 400 });
  await assert.rejects(boundedCartRequest(async () => { throw error; }), (actual) => actual === error);
});

test('late success after timeout is not treated as a successful sync', async () => {
  let resolve;
  const pending = boundedCartRequest(() => new Promise((done) => { resolve = done; }), 10);
  await assert.rejects(pending, { code: 'cart_timeout' });
  resolve({ items: [], revision: 10 });
  await assert.rejects(pending, { code: 'cart_timeout' });
});

test('failed hydration provides retry instead of an endless loading button', async () => {
  const drawer = await readFile(new URL('../src/components/Drawer.jsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(drawer, /\{syncFailed \?[\s\S]*?onClick=\{onRetryCartSync\}[\s\S]*?Retry account basket sync/);
  assert.match(app, /if \(cancelled \|\| hydrationInFlight\) return/);
  assert.match(app, /finally \{\s*hydrationInFlight = false/);
  assert.match(app, /!\[400, 401, 403, 413, 422\]\.includes\(error\?\.status\)/);
});

test('support guidance classifies failures without exposing raw basket details', () => {
  for (const [status, message, code] of [
    [400, 'Duplicate basket product: PRIVATE-SKU', 'cart_duplicate'],
    [400, 'Basket activity time is invalid', 'cart_activity'],
    [400, 'Basket quantity must be a whole number', 'cart_quantity'],
    [401, 'Unauthorized', 'cart_authentication'],
    [403, 'Forbidden', 'cart_permission'],
    [503, 'Database connection failed PRIVATE', 'cart_connection'],
  ]) {
    const failure = cartSyncFailure({ status, message });
    assert.equal(failure.code, code);
    assert.doesNotMatch(failure.detail, /PRIVATE/);
    assert.equal(failure.retryable, status === 503);
  }
  assert.equal(cartSyncFailure({ code: 'cart_timeout' }).code, 'cart_timeout');
});
