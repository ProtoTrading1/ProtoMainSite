import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthWeakPasswordError, createClient } from '@supabase/supabase-js';
import { createRegisterTradeHandler } from '../api/register-trade.js';
import { registrationReceipt } from '../api/_registration-receipt.js';
import { PASSWORD_STRENGTH_GUIDANCE } from '../src/lib/passwordPolicy.js';
import { applicationFailure, createTradeApplicationAttempt } from '../src/lib/tradeApplicationAttempt.mjs';

const PRIVATE = 'PRIVATE PROVIDER REASON';
const PASSWORD = 'synthetic-password-only';
const id = '00000000-0000-4000-8000-000000000777';
const rejection = () => ({
  error: 'Choose a stronger password before submitting again.',
  code: 'REGISTRATION_PASSWORD_REJECTED',
  fieldErrors: { password: 'This password is too weak. Please choose a stronger, unique password.' },
});
const payload = () => ({
  email: 'synthetic@fixture.invalid', password: PASSWORD, contactName: 'Synthetic Applicant',
  businessName: 'Synthetic Trade', phone: '0825550123', companyAddress: '1 Fixture Road',
  deliveryAddress: '1 Fixture Road', country: 'South Africa', streetName: '1 Fixture Road',
  suburb: 'Fixture Suburb', city: 'Fixture City', postalCode: '0001', buildingType: 'House',
  acceptWhatsapp: false, salesChannels: ['Physical retail store'],
  productCategories: ['Art, craft & beads'], businessDescription: 'Synthetic gifts supplied to local shops.',
});
const response = () => ({
  statusCode: 200, headers: {}, status(value) { this.statusCode = value; return this; },
  setHeader(key, value) { this.headers[key] = value; }, json(body) { this.body = body; return this; }, end() { return this; },
});
function fixture(t, { creation = async () => ({ data: { user: { id } }, error: null }), profileError = null, rateLimit } = {}) {
  const previous = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = 'synthetic-no-network';
  t.after(() => { if (previous === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = previous; });
  const calls = { create: [], upsert: [], delete: [], mail: [], limits: [], logs: [], waits: [] };
  t.mock.method(console, 'error', (...args) => calls.logs.push(args));
  t.mock.method(console, 'warn', (...args) => calls.logs.push(args));
  const client = {
    auth: { admin: {
      createUser: async data => { calls.create.push(data); return creation(data); },
      deleteUser: async value => { calls.delete.push(value); return { error: null }; },
    } },
    from: () => ({
      select() { return this; }, eq() { return this; }, limit: async () => ({ error: null }),
      single: async () => ({ data: { id, email: payload().email, is_approved: false }, error: null }),
      upsert: async data => { calls.upsert.push(data); if (profileError) throw profileError; return { error: null }; },
    }),
  };
  const handler = createRegisterTradeHandler({
    createServiceClient: () => client,
    rateLimit: async value => { calls.limits.push(value); return rateLimit ? rateLimit(value, calls.limits.length) : { allowed: true }; },
    sendAdmin: async value => calls.mail.push({ kind: 'staff', value }),
    sendVerification: async value => calls.mail.push({ kind: 'verification', value }),
    now: () => 0, wait: async value => calls.waits.push(value),
  });
  return { calls, async submit(body = payload()) { const res = response(); await handler({ method: 'POST', headers: {}, body }, res); return res; } };
}
function journal() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const clientRejection = (data = rejection(), status = 422, code = data.code) => Object.assign(new Error(PRIVATE), { status, code, data });

for (const reasons of [['length'], ['characters'], ['pwned'], []]) {
  for (const mode of ['returned', 'thrown']) {
    test(`confirmed SDK weak_password ${mode}, reasons ${reasons.join(',') || 'none'}, gives fixed guidance without side effects`, async t => {
      const error = new AuthWeakPasswordError(`${PRIVATE} ${PASSWORD}`, 422, reasons);
      const f = fixture(t, { creation: async () => { if (mode === 'thrown') throw error; return { data: { user: null }, error }; } });
      const res = await f.submit();
      assert.equal(res.statusCode, 422); assert.deepEqual(res.body, rejection());
      assert.equal(PASSWORD_STRENGTH_GUIDANCE, rejection().fieldErrors.password);
      assert.equal(f.calls.create.length, 1); assert.equal(f.calls.limits.length, 2);
      assert.deepEqual(f.calls.upsert, []); assert.deepEqual(f.calls.delete, []); assert.deepEqual(f.calls.mail, []);
      assert.doesNotMatch(JSON.stringify({ body: res.body, logs: f.calls.logs }), new RegExp(`${PRIVATE}|${PASSWORD}`));
      assert.ok(!JSON.stringify(res.body).includes('reasons'));
    });
  }
}
for (const legacy of [false, true]) {
  test(`actual SDK converts ${legacy ? 'legacy structured reasons' : 'explicit provider code'} through synthetic HTTP without network`, async t => {
    let providerCalls = 0;
    const providerBody = { msg: PRIVATE, weak_password: { reasons: ['length', 'characters', 'pwned'] }, ...(legacy ? {} : { code: 'weak_password' }) };
    const provider = createClient('http://127.0.0.1:1', 'synthetic-only-key', {
      global: { fetch: async () => { providerCalls++; return new Response(JSON.stringify(providerBody), { status: 422, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } }); } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const f = fixture(t, { creation: data => provider.auth.admin.createUser(data) });
    const res = await f.submit();
    assert.equal(providerCalls, 1); assert.equal(res.statusCode, 422); assert.deepEqual(res.body, rejection());
    assert.deepEqual(f.calls.mail, []); assert.deepEqual(f.calls.upsert, []);
    assert.doesNotMatch(JSON.stringify(f.calls.logs), /PRIVATE|synthetic-password-only/);
  });
}
for (const [label, error] of [
  ['duplicate', { code: 'email_exists', message: `${PRIVATE} already registered ${PASSWORD}` }],
  ['same weak-looking name only', { name: 'AuthWeakPasswordError', message: `${PRIVATE} weak password` }],
  ['same weak-looking text only', new Error(`${PRIVATE} weak_password`) ],
  ['different code', { code: 'validation_failed', reasons: ['pwned'], message: PRIVATE }],
  ['uppercase code', { code: 'WEAK_PASSWORD', message: PRIVATE }],
  ['unknown transport', new TypeError(`${PRIVATE} ${PASSWORD}`)],
]) {
  for (const mode of ['returned', 'thrown']) {
    test(`${label} ${mode} stays neutral and cannot mutate an existing account or send mail`, async t => {
      const f = fixture(t, { creation: async () => { if (mode === 'thrown') throw error; return { data: { user: null }, error }; } });
      const res = await f.submit();
      assert.equal(res.statusCode, 200); assert.deepEqual(res.body, registrationReceipt());
      assert.deepEqual(f.calls.waits, [1400]); assert.deepEqual(f.calls.mail, []); assert.deepEqual(f.calls.upsert, []); assert.deepEqual(f.calls.delete, []);
      assert.doesNotMatch(JSON.stringify({ body: res.body, logs: f.calls.logs }), /PRIVATE|synthetic-password-only|already registered/);
    });
  }
}
test('a new successful account keeps existing verification, pending approval and neutral receipt behavior', async t => {
  const f = fixture(t); const res = await f.submit();
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, registrationReceipt());
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.create[0].email_confirm, false);
  assert.equal(f.calls.upsert.length, 1); assert.equal(f.calls.upsert[0].is_approved, false);
  assert.equal(f.calls.upsert[0].customer_code, null); assert.deepEqual(f.calls.delete, []);
  assert.deepEqual(f.calls.mail.map(({ kind }) => kind), ['staff', 'verification']);
});
test('weak_password from a later profile operation cannot become a retryable account-creation rejection', async t => {
  const f = fixture(t, { profileError: new AuthWeakPasswordError(PRIVATE, 422, ['pwned']) });
  const res = await f.submit();
  assert.equal(f.calls.create.length, 1); assert.equal(f.calls.upsert.length, 1);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, registrationReceipt()); assert.deepEqual(f.calls.mail, []);
  assert.doesNotMatch(JSON.stringify(f.calls.logs), /PRIVATE|pwned|synthetic-password-only/);
});
for (const denied of ['ip', 'email']) {
  test(`${denied} throttle remains before provider and keeps existing bucket limits`, async t => {
    const f = fixture(t, { rateLimit: (_value, count) => ({ allowed: count !== (denied === 'ip' ? 1 : 2), retryAfter: 90 }) });
    const res = await f.submit();
    assert.equal(res.statusCode, 429); assert.equal(res.headers['Retry-After'], '90');
    assert.deepEqual(f.calls.create, []); assert.deepEqual(f.calls.mail, []);
    assert.equal(f.calls.limits[0].max, 30); assert.equal(f.calls.limits[0].windowSeconds, 3600);
    if (denied === 'email') { assert.equal(f.calls.limits[1].max, 3); assert.equal(f.calls.limits[1].windowSeconds, 3600); }
  });
}
test('only the exact fixed password envelope allows correction; provider text is never exposed', () => {
  const safe = applicationFailure(clientRejection());
  assert.equal(safe.retrySafe, true); assert.equal(safe.outcomeUnknown, false); assert.deepEqual(safe.fieldErrors, rejection().fieldErrors);
  assert.doesNotMatch(safe.message, /PRIVATE|already registered/);
  const fixtures = [
    clientRejection(rejection(), 400), clientRejection(rejection(), 500), clientRejection(rejection(), 422, 'weak_password'),
    clientRejection({ ...rejection(), error: PRIVATE }),
    clientRejection({ ...rejection(), fieldErrors: { password: PRIVATE } }),
    clientRejection({ ...rejection(), fieldErrors: { password: rejection().fieldErrors.password, email: 'Enter your email address.' } }),
    clientRejection({ ...rejection(), fieldErrors: {} }), clientRejection({ ...rejection(), fieldErrors: [] }),
    clientRejection({ ...rejection(), fieldErrors: null }),
  ];
  for (const error of fixtures) {
    const failure = applicationFailure(error);
    assert.equal(failure.retrySafe, false); assert.equal(failure.outcomeUnknown, true); assert.deepEqual(failure.fieldErrors, {});
    assert.doesNotMatch(failure.message, /PRIVATE/);
  }
});
test('definite weakness releases the marker without retrying; stronger correction requires an explicit second call', async () => {
  let sends = 0; const storage = journal(); const bodies = [];
  const attempt = createTradeApplicationAttempt({ storage, send: async body => { bodies.push(body); sends++; if (sends === 1) throw clientRejection(); return registrationReceipt(); } });
  await assert.rejects(attempt.submit(payload()), { code: 'REGISTRATION_PASSWORD_REJECTED', retrySafe: true, outcomeUnknown: false });
  assert.equal(attempt.state, 'idle'); assert.equal(storage.values.size, 0); assert.equal(sends, 1);
  await attempt.submit({ ...payload(), password: 'explicit-stronger-fixture' });
  assert.equal(attempt.state, 'confirmed'); assert.equal(sends, 2); assert.equal(bodies[1].password, 'explicit-stronger-fixture');
  assert.equal(storage.values.size, 0);
});
for (const [kind, result] of [
  ['lost', () => { throw new TypeError(PRIVATE); }],
  ['unknown 503', () => { throw Object.assign(new Error(PRIVATE), { status: 503, data: { error: PRIVATE } }); }],
  ['malformed success', () => ({ ok: true })],
]) {
  test(`${kind} holds both explicit repeat and refreshed attempts without automatic retry`, async () => {
    let sends = 0; const storage = journal(); const send = async () => { sends++; return result(); };
    const attempt = createTradeApplicationAttempt({ storage, send });
    await assert.rejects(attempt.submit(payload()), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
    await assert.rejects(attempt.submit(payload()), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
    const restored = createTradeApplicationAttempt({ storage, send });
    await assert.rejects(restored.submit(payload()), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
    assert.equal(sends, 1); assert.deepEqual([...storage.values.values()], ['unknown']);
    assert.doesNotMatch(JSON.stringify([...storage.values]), /synthetic|password|fixture.invalid/);
  });
}
test('interruption followed by a late definite weak rejection still retains the unknown hold', async () => {
  let reject; let sends = 0; const storage = journal();
  const attempt = createTradeApplicationAttempt({ storage, send: () => { sends++; return new Promise((_resolve, fail) => { reject = fail; }); } });
  const pending = attempt.submit(payload()); attempt.cancel(); reject(clientRejection());
  await assert.rejects(pending, { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
  assert.equal(attempt.state, 'unknown'); await assert.rejects(attempt.submit(payload()), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
  assert.equal(sends, 1); assert.deepEqual([...storage.values.values()], ['unknown']);
});
