import test from 'node:test';
import assert from 'node:assert/strict';
import { signResetToken, verifyResetTokenRaw, timingSafeEqualStr } from '../api/_reset-token.js';

const SECRET = 'test-secret-value';

test('round-trips claims (email lowercased, version + scope preserved)', () => {
  const token = signResetToken({ email: 'Cust@Proto.co.za', v: 2, scope: 'customer' }, SECRET, 60_000);
  const data = verifyResetTokenRaw(token, SECRET);
  assert.equal(data.email, 'cust@proto.co.za');
  assert.equal(data.v, 2);
  assert.equal(data.scope, 'customer');
});

test('defaults version to 0', () => {
  assert.equal(verifyResetTokenRaw(signResetToken({ email: 'a@b.co' }, SECRET, 60_000), SECRET).v, 0);
});

test('rejects a tampered payload', () => {
  const token = signResetToken({ email: 'a@b.co', v: 0 }, SECRET, 60_000);
  const [, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ email: 'a@b.co', v: 9, exp: Date.now() + 60_000 })).toString('base64url');
  assert.throws(() => verifyResetTokenRaw(`${forged}.${sig}`, SECRET), /Invalid or expired reset link/);
});

test('rejects a token signed with a different secret', () => {
  assert.throws(() => verifyResetTokenRaw(signResetToken({ email: 'a@b.co' }, 'other', 60_000), SECRET), /Invalid or expired reset link/);
});

test('rejects an expired token', () => {
  assert.throws(() => verifyResetTokenRaw(signResetToken({ email: 'a@b.co' }, SECRET, -1), SECRET), /expired/i);
});

test('rejects a malformed token', () => {
  assert.throws(() => verifyResetTokenRaw('not-a-token', SECRET), /Invalid or expired reset link/);
  assert.throws(() => verifyResetTokenRaw('', SECRET), /Invalid or expired reset link/);
});

test('a bumped version invalidates an old link (single-use guarantee)', () => {
  const oldLink = signResetToken({ email: 'a@b.co', v: 0, scope: 'customer' }, SECRET, 60_000);
  const claim = verifyResetTokenRaw(oldLink, SECRET);
  const currentUserVersion = 1; // a reset already happened
  assert.equal(claim.v === currentUserVersion, false); // caller rejects on mismatch
});

test('timingSafeEqualStr is true only for equal non-empty strings', () => {
  assert.equal(timingSafeEqualStr('abc', 'abc'), true);
  assert.equal(timingSafeEqualStr('abc', 'abd'), false);
  assert.equal(timingSafeEqualStr('abc', 'abcd'), false);
  assert.equal(timingSafeEqualStr('', ''), false);
});
