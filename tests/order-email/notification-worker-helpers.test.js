import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProviderFailure,
  parseRetryAfter,
} from '../../api/_notification-provider.js';
import {
  retryDelayMs,
  shouldRetryJob,
} from '../../api/_notification-retry.js';

test('provider failures distinguish transient, configuration and permanent rejection', () => {
  assert.deepEqual(classifyProviderFailure(429), {
    retryable: true,
    code: 'provider_transient',
  });
  assert.deepEqual(classifyProviderFailure(503), {
    retryable: true,
    code: 'provider_transient',
  });
  assert.deepEqual(classifyProviderFailure(401), {
    retryable: false,
    code: 'provider_configuration',
  });
  assert.deepEqual(classifyProviderFailure(400), {
    retryable: false,
    code: 'provider_rejected',
  });
});

test('Retry-After supports seconds and HTTP dates', () => {
  assert.equal(parseRetryAfter('12', 0), 12000);
  assert.equal(parseRetryAfter('Thu, 01 Jan 1970 00:00:20 GMT', 5000), 15000);
  assert.equal(parseRetryAfter('invalid', 0), null);
});

test('retry schedule honours Retry-After and stops at max attempts', () => {
  assert.equal(retryDelayMs(1, 9000, () => 0), 9000);
  assert.equal(retryDelayMs(1, null, () => 0), 60000);
  assert.equal(retryDelayMs(2, null, () => 0), 300000);
  assert.equal(shouldRetryJob({ attempts: 2, max_attempts: 6 }, { retryable: true }), true);
  assert.equal(shouldRetryJob({ attempts: 6, max_attempts: 6 }, { retryable: true }), false);
  assert.equal(shouldRetryJob({ attempts: 1, max_attempts: 6 }, { retryable: false }), false);
});

test('email provider records API success as accepted, never delivered', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../../api/_notification-provider.js', import.meta.url), 'utf8'));
  assert.match(source, /state:\s*'accepted'/);
  assert.doesNotMatch(source, /state:\s*'delivered'/);
  assert.doesNotMatch(source, /WATI|team_whatsapp/i);
});
