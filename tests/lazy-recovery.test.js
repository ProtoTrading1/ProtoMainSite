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
