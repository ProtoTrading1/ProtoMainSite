import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWithRetry } from '../src/lib/lazyWithRetry.js';

test('successful lazy imports remain successful when optional session storage is blocked', async () => {
  const browser = { sessionStorage: { removeItem() { throw new Error('Storage blocked'); } } };
  const module = { default: 'page' };
  assert.equal(await loadWithRetry(() => Promise.resolve(module), 'page', browser), module);
});

test('a failed chunk with blocked retry storage reaches recovery without an infinite reload', async () => {
  let reloads = 0;
  const browser = { sessionStorage: { getItem() { throw new Error('Storage blocked'); } }, location: { reload() { reloads++; } } };
  const failure = new Error('Failed to fetch dynamically imported module');
  await assert.rejects(loadWithRetry(() => Promise.reject(failure), 'page', browser), (error) => error === failure);
  assert.equal(reloads, 0);
});

test('an already retried failed chunk preserves its original error and clears retry state', async () => {
  let clears = 0;
  const browser = { sessionStorage: { getItem: () => 'page', removeItem() { clears++; } }, location: { reload() { assert.fail('Must not reload twice'); } } };
  const failure = new Error('Importing a module script failed');
  await assert.rejects(loadWithRetry(() => Promise.reject(failure), 'page', browser), (error) => error === failure);
  assert.equal(clears, 1);
});


test('cancelled reload rejects the original chunk failure and preserves the once marker', async () => {
  const entries = new Map([['proto_cart_pending_synthetic', 'original-basket-journal']]);
  const touched = [];
  let reloads = 0;
  const browser = {
    sessionStorage: {
      getItem(key) { touched.push(key); return entries.get(key) ?? null; },
      setItem(key, value) { touched.push(key); entries.set(key, value); },
      removeItem(key) { touched.push(key); entries.delete(key); },
    },
    location: { reload() { reloads++; } },
  };
  const failure = new Error('Failed to fetch dynamically imported module');
  await assert.rejects(loadWithRetry(() => Promise.reject(failure), 'order-modal', browser), error => error === failure);
  assert.equal(reloads, 1);
  assert.equal(entries.get('proto-lazy-retry'), 'order-modal');
  assert.equal(entries.get('proto_cart_pending_synthetic'), 'original-basket-journal');
  assert.deepEqual([...new Set(touched)], ['proto-lazy-retry']);
  await assert.rejects(loadWithRetry(() => Promise.reject(failure), 'order-modal', browser), error => error === failure);
  assert.equal(reloads, 1, 'already marked failure does not issue another automatic reload');
});

test('successful import clears only the lazy retry marker and never requests a reload', async () => {
  const entries = new Map([['proto-lazy-retry', 'page'], ['proto_pending_checkout_v1:synthetic', 'original-order-journal']]);
  const browser = {
    sessionStorage: { removeItem: key => entries.delete(key) },
    location: { reload() { assert.fail('Successful import must not reload'); } },
  };
  const module = { default: 'loaded-page' };
  assert.equal(await loadWithRetry(() => Promise.resolve(module), 'page', browser), module);
  assert.equal(entries.has('proto-lazy-retry'), false);
  assert.equal(entries.get('proto_pending_checkout_v1:synthetic'), 'original-order-journal');
});
