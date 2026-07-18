import test from 'node:test';
import assert from 'node:assert/strict';
import { isVerifiedProtoActiveMatch } from '../api/_customer-onboard.js';

test('only an exact registered-email match qualifies for instant access', () => {
  assert.equal(isVerifiedProtoActiveMatch({
    matchType: 'email',
    row: { account_code: 'ABC123' },
  }), true);
});

test('a customer-code lookup alone never qualifies for instant access', () => {
  assert.equal(isVerifiedProtoActiveMatch({
    matchType: 'customer_code',
    row: { account_code: 'ABC123' },
  }), false);
});

test('missing or incomplete matches never qualify for instant access', () => {
  assert.equal(isVerifiedProtoActiveMatch(null), false);
  assert.equal(isVerifiedProtoActiveMatch({ matchType: 'email', row: null }), false);
  assert.equal(isVerifiedProtoActiveMatch({ matchType: 'email', row: {} }), false);
});
