import test from 'node:test';
import assert from 'node:assert/strict';
import { sendTradeVerificationEmail, verifyTradeEmail } from '../api/_trade-email-verification.js';
import { createResendTradeVerificationHandler } from '../api/resend-trade-verification.js';

const user = { id: '10000000-0000-4000-8000-000000000001', email: 'buyer@company.co.za' };
const token = 'a'.repeat(64);
const allowed = async () => ({ allowed: true });
const response = () => ({
  statusCode: 200, setHeader() {},
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }, end() { return this; },
});
const pendingClient = {
  from: () => ({
    select() { return this; }, eq() { return this; },
    async maybeSingle() {
      return { data: { ...user, trade_email_verification_required: true, trade_email_verified_at: null } };
    },
  }),
};

test('resend failures are observed safely without disclosing a pending application', async () => {
  for (const delivery of [{ sent: false }, undefined]) {
    const failures = [];
    const handler = createResendTradeVerificationHandler({
      rateLimit: allowed, client: () => pendingClient, send: async () => delivery,
      onFailure: (...details) => failures.push(details),
    });
    const res = response();
    await handler({ method: 'POST', headers: {}, body: { email: user.email } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { ok: true });
    assert.deepEqual(failures, [[]], 'no address, provider error or token enters the failure callback');
    assert.doesNotMatch(JSON.stringify(res.body), /buyer@|token_hash|access_token/);
  }
});

test('unknown, completed and failed pending resends share the same public receipt', async () => {
  const receipts = [];
  for (const profile of [null, { ...user, trade_email_verified_at: '2026-10-05T12:00:00Z' },
    { ...user, trade_email_verification_required: true, trade_email_verified_at: null }]) {
    let failures = 0;
    const handler = createResendTradeVerificationHandler({
      rateLimit: allowed,
      client: () => ({ from: () => ({ select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: profile }; },
      }) }),
      send: async () => { throw Error('Synthetic provider failure with private details'); },
      onFailure: () => { failures++; },
    });
    const res = response();
    await handler({ method: 'POST', headers: {}, body: { email: user.email } }, res);
    receipts.push({ status: res.statusCode, body: res.body });
    assert.equal(failures, profile?.trade_email_verification_required ? 1 : 0);
  }
  assert.deepEqual(receipts, Array(3).fill({ status: 200, body: { ok: true } }));
});

test('a delivered resend shares the neutral request receipt', async () => {
  const handler = createResendTradeVerificationHandler({
    rateLimit: allowed, client: () => pendingClient, send: async () => ({ sent: true }),
  });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { email: user.email } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('a rejected mail provider response fails safely after generating the replacement', async () => {
  const prior = process.env.BREVO_API_KEY;
  process.env.BREVO_API_KEY = 'synthetic-key';
  let generated = 0;
  try {
    const client = { auth: { admin: { generateLink: async () => {
      generated++;
      return { data: { user, properties: { hashed_token: token } } };
    } } } };
    await assert.rejects(sendTradeVerificationEmail({
      client, userId: user.id, email: user.email,
      fetcher: async () => ({ ok: false, status: 503 }),
    }), /Confirmation email is unavailable/);
    assert.equal(generated, 1);
  } finally {
    if (prior === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = prior;
  }
});

test('missing mail configuration cannot replace a previously valid link', async () => {
  const prior = process.env.BREVO_API_KEY;
  delete process.env.BREVO_API_KEY;
  try {
    await assert.rejects(sendTradeVerificationEmail({
      client: { auth: { admin: { generateLink: async () => { throw Error('Must not mint'); } } } },
      userId: user.id, email: user.email,
      fetcher: async () => { throw Error('Must not send'); },
    }), /Confirmation email is unavailable/);
  } finally {
    if (prior !== undefined) process.env.BREVO_API_KEY = prior;
  }
});

test('a replaced proof cannot update the profile and directs the applicant to the newest email', async () => {
  let callbacks = 0;
  const serviceClient = { rpc: async () => {
    callbacks++;
    return { data: { verified: true, approved: false } };
  } };
  const verifyClient = { auth: { verifyOtp: async () => ({
    data: null, error: { code: 'otp_expired', message: 'One-time token not found' },
  }) } };
  await assert.rejects(
    verifyTradeEmail({ tokenHash: token, verifyClient, serviceClient }),
    error => error.status === 400 && /newest confirmation email/.test(error.message),
  );
  assert.equal(callbacks, 0);
});
