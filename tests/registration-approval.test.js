import test from 'node:test';
import assert from 'node:assert/strict';
import { isVerifiedProtoActiveMatch } from '../api/_customer-onboard.js';

test('email match alone never qualifies for access', () => {
  assert.equal(isVerifiedProtoActiveMatch({
    matchType: 'email',
    row: { account_code: 'ABC123' },
  }), false);
});

test('successful mailbox verification must match the legacy eligibility email', () => {
  const match={matchType:'email',row:{account_code:'ABC123',email:'buyer@company.co.za'}};
  assert.equal(isVerifiedProtoActiveMatch(match,{email:'buyer@company.co.za'}),false);
  assert.equal(isVerifiedProtoActiveMatch(match,{email:'other@company.co.za',email_confirmed_at:'2026-10-03'}),false);
  assert.equal(isVerifiedProtoActiveMatch(match,{email:'BUYER@company.co.za',email_confirmed_at:'2026-10-03'}),true);
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
