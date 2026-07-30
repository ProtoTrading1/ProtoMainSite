import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  resolveTtlSeconds,
  signMessengerJwt,
  verifyMessengerJwt,
} from '../../api/intercom/_messenger-jwt.js';

const SECRET = 'messenger-secret-value';
const NOW = 1_750_000_000;

test('signs a verifiable HS256 token carrying user_id and email', () => {
  const token = signMessengerJwt(
    { userId: 'user-uuid-1', email: 'buyer@example.com', now: NOW },
    SECRET,
  );

  const [header] = token.split('.');
  assert.deepEqual(
    JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
    { alg: 'HS256', typ: 'JWT' },
  );

  const claims = verifyMessengerJwt(token, SECRET, { now: NOW });
  assert.equal(claims.user_id, 'user-uuid-1');
  assert.equal(claims.email, 'buyer@example.com');
  assert.equal(claims.iat, NOW);
  assert.equal(claims.exp, NOW + DEFAULT_TTL_SECONDS);
});

test('omits name when absent rather than emitting a null claim', () => {
  const withoutName = verifyMessengerJwt(
    signMessengerJwt({ userId: 'u', email: 'a@b.co', now: NOW }, SECRET),
    SECRET,
    { now: NOW },
  );
  assert.equal('name' in withoutName, false);

  const withName = verifyMessengerJwt(
    signMessengerJwt({ userId: 'u', email: 'a@b.co', name: 'Bead Shop', now: NOW }, SECRET),
    SECRET,
    { now: NOW },
  );
  assert.equal(withName.name, 'Bead Shop');
});

test('rejects a token signed with a different secret', () => {
  const token = signMessengerJwt({ userId: 'u', email: 'a@b.co', now: NOW }, SECRET);
  assert.equal(verifyMessengerJwt(token, 'other-secret', { now: NOW }), null);
});

test('rejects a tampered email claim — the whole point of signing', () => {
  const token = signMessengerJwt({ userId: 'u', email: 'buyer@example.com', now: NOW }, SECRET);
  const [header, payload, signature] = token.split('.');

  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  claims.email = 'someone.else@example.com';
  const forged = Buffer.from(JSON.stringify(claims), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  assert.equal(verifyMessengerJwt(`${header}.${forged}.${signature}`, SECRET, { now: NOW }), null);
});

test('rejects an expired token', () => {
  const token = signMessengerJwt(
    { userId: 'u', email: 'a@b.co', ttlSeconds: 60, now: NOW },
    SECRET,
  );
  assert.ok(verifyMessengerJwt(token, SECRET, { now: NOW + 59 }));
  assert.equal(verifyMessengerJwt(token, SECRET, { now: NOW + 60 }), null);
});

test('rejects malformed tokens', () => {
  for (const bad of ['', null, undefined, 'a.b', 'a.b.c.d', 'not-a-token']) {
    assert.equal(verifyMessengerJwt(bad, SECRET, { now: NOW }), null);
  }
});

test('requires a secret, userId and email', () => {
  assert.throws(() => signMessengerJwt({ userId: 'u', email: 'a@b.co' }, ''), /secret/i);
  assert.throws(() => signMessengerJwt({ email: 'a@b.co' }, SECRET), /userId/);
  assert.throws(() => signMessengerJwt({ userId: 'u' }, SECRET), /email/);
});

test('TTL falls back to the default and is capped at 24h', () => {
  assert.equal(resolveTtlSeconds(undefined), DEFAULT_TTL_SECONDS);
  assert.equal(resolveTtlSeconds(''), DEFAULT_TTL_SECONDS);
  assert.equal(resolveTtlSeconds('not-a-number'), DEFAULT_TTL_SECONDS);
  assert.equal(resolveTtlSeconds('0'), DEFAULT_TTL_SECONDS);
  assert.equal(resolveTtlSeconds('-5'), DEFAULT_TTL_SECONDS);
  assert.equal(resolveTtlSeconds('3600'), 3600);
  assert.equal(resolveTtlSeconds(String(MAX_TTL_SECONDS * 10)), MAX_TTL_SECONDS);
});
