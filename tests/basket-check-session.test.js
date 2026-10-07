import test from 'node:test';
import assert from 'node:assert/strict';
import { basketSessionStorageKey, createBasketCheckSessionHandler } from '../api/basket-check-session.js';

const PROJECT = 'abcdefghijklmnopqrst';
const ID = 'b8295498-9d90-4634-b38c-361dddc4c8c8';
function response() {
  return { headers: {}, statusCode: null, body: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}
function setup(authenticate = async () => ({ id: ID })) {
  let calls = 0;
  const handler = createBasketCheckSessionHandler({
    environment: { VITE_SUPABASE_URL: `https://${PROJECT}.supabase.co` },
    authenticate: async (...args) => { calls++; return authenticate(...args); },
  });
  return { handler, calls: () => calls };
}
const request = (mode = 'identity', extra = {}) => ({ method: 'GET', query: { mode }, headers: {}, ...extra });

test('only a configured canonical HTTPS Supabase project produces a session key', () => {
  assert.equal(basketSessionStorageKey(`https://${PROJECT}.supabase.co/`), `sb-${PROJECT}-auth-token`);
  for (const value of [undefined, '', 'broken', `http://${PROJECT}.supabase.co`,
    `https://${PROJECT}.supabase.co.evil.invalid`, 'https://custom.invalid',
    `https://user:password@${PROJECT}.supabase.co`, `https://${PROJECT}.supabase.co:8443`,
    `https://${PROJECT}.supabase.co/path`, `https://${PROJECT}.supabase.co/?secret=x`,
    `https://${PROJECT}.supabase.co/#token`, 'https://short.supabase.co']) {
    assert.equal(basketSessionStorageKey(value), null);
  }
});

test('config is nonsecret and performs no authentication or record query', async () => {
  const { handler, calls } = setup(); const res = response();
  await handler(request('config'), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { version: 1, sessionStorageKey: `sb-${PROJECT}-auth-token` });
  assert.equal(calls(), 0);
  assert.equal(res.headers['Cache-Control'], 'no-store, private');
  assert.equal(res.headers.Vary, 'Authorization');
});

test('identity returns only the verified UUID and config, discarding personal/auth fields', async () => {
  const { handler, calls } = setup(async () => ({ id: ID.toUpperCase(), email: 'private@example.invalid', access_token: 'secret', user_metadata: { id: 'foreign' } }));
  const res = response(); await handler(request(), res);
  assert.deepEqual(res.body, { version: 1, customerId: ID, sessionStorageKey: `sb-${PROJECT}-auth-token` });
  assert.equal(calls(), 1);
});

test('all write methods are rejected before auth and have no effects', async () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS', 'HEAD']) {
    const { handler, calls } = setup(); const res = response();
    await handler(request('identity', { method }), res);
    assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'GET'); assert.equal(calls(), 0);
  }
});

test('foreign selectors, ambiguous modes and request bodies fail before auth', async () => {
  for (const extra of [{ query: { mode: 'identity', customerId: ID } },
    { query: { mode: ['identity', 'config'] } }, { query: {} },
    { query: { mode: 'clear' } }, { body: { customerId: ID } }, { body: 'token' }]) {
    const { handler, calls } = setup(); const res = response();
    await handler(request('identity', extra), res);
    assert.equal(res.statusCode, 400); assert.equal(calls(), 0);
  }
});

test('missing or unsafe server config fails closed before verification', async () => {
  let calls = 0;
  const handler = createBasketCheckSessionHandler({ environment: {}, authenticate: async () => { calls++; } });
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 503); assert.equal(calls, 0);
});

test('rejected and expired sessions expose no identity', async () => {
  const { handler } = setup(async (_req, res) => { res.status(401).json({ error: 'Unauthorized' }); return null; });
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 401); assert.deepEqual(res.body, { error: 'Unauthorized' });
});

test('malicious or missing verified identifiers fail closed', async () => {
  for (const id of [null, undefined, '<script>alert(1)</script>', 'foreign', { value: ID }]) {
    const { handler } = setup(async () => ({ id })); const res = response();
    await handler(request(), res); assert.equal(res.statusCode, 401);
    assert.equal(JSON.stringify(res.body).includes(String(id)), false);
  }
});

test('verification interruptions return fixed errors without tokens or exception details', async () => {
  const { handler } = setup(async () => { throw new Error('secret bearer and customer details'); });
  const res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 503); assert.deepEqual(res.body, { error: 'Session verification unavailable' });
});

test('every identity request is independently verified without cached account state', async () => {
  let current = ID;
  const { handler, calls } = setup(async () => ({ id: current }));
  const first = response(); await handler(request(), first);
  current = '8ef9b623-ce92-4080-b4bf-3d8e2a389e92';
  const second = response(); await handler(request(), second);
  assert.equal(first.body.customerId, ID); assert.equal(second.body.customerId, current); assert.equal(calls(), 2);
});
