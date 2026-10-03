import test from 'node:test';
import assert from 'node:assert/strict';
import { requestJson, withDeadline } from '../src/lib/requestDeadline.mjs';

test('deadline settles a stalled request and aborts its network signal', async () => {
  const previous = globalThis.fetch;
  let signal;
  globalThis.fetch = (_url, options) => { signal = options.signal; return new Promise(() => {}); };
  try {
    await assert.rejects(requestJson('/mock', {}, { timeoutMs: 8, message: 'Order outcome unknown.' }), { code: 'REQUEST_TIMEOUT', message: 'Order outcome unknown.' });
    assert.equal(signal.aborted, true);
  } finally { globalThis.fetch = previous; }
});

test('deadline also covers a stalled response body', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: () => new Promise(() => {}) });
  try { await assert.rejects(requestJson('/mock', {}, { timeoutMs: 8 }), { code: 'REQUEST_TIMEOUT' }); }
  finally { globalThis.fetch = previous; }
});

test('late completion does not change timed-out outcome and success cancels the timeout', async () => {
  let release;
  let timedOut = 0;
  const operation = withDeadline(new Promise((resolve) => { release = resolve; }), { timeoutMs: 8, onTimeout: () => { timedOut += 1; } });
  await assert.rejects(operation, { code: 'REQUEST_TIMEOUT' });
  release('late');
  assert.equal(timedOut, 1);
  assert.equal(await withDeadline(Promise.resolve('saved'), { timeoutMs: 8, onTimeout: () => { timedOut += 1; } }), 'saved');
  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.equal(timedOut, 1);
});

test('structured validation/review/conflict errors are preserved and no retry is sent', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: false, status: 409, json: async () => ({ error: 'Review required', code: 'ORDER_REVIEW_REQUIRED', changes: [{ sku: 'TEST' }], recovery: 'retry-original' }) }; };
  try {
    await assert.rejects(requestJson('/mock'), (error) => error.status === 409 && error.code === 'ORDER_REVIEW_REQUIRED' && error.changes[0].sku === 'TEST' && error.recovery === 'retry-original');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previous; }
});

test('successful malformed JSON is a failed response instead of invented empty data', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('invalid'); } });
  try { await assert.rejects(requestJson('/mock'), { code: 'INVALID_RESPONSE' }); }
  finally { globalThis.fetch = previous; }
});
