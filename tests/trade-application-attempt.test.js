import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationFailure, createTradeApplicationAttempt, isConfirmedTradeApplication } from '../src/lib/tradeApplicationAttempt.mjs';

const confirmed = () => ({ ok: true, instantAccess: false, emailVerificationRequired: true, verificationEmailSent: true, profile: { id: '00000000-0000-4000-8000-000000000001' } });
function storage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const failure = (status, error, code = null) => Object.assign(new Error('Private provider text must not reach the customer'), { status, code, data: { error } });

test('two concurrent registration submits send one request and journal no customer information', async () => {
  let resolve; let sends = 0;
  const journal = storage();
  const attempt = createTradeApplicationAttempt({ storage: journal, send: async () => { sends++; return new Promise(r => { resolve = r; }); } });
  const first = attempt.submit({ email: 'synthetic@fixture.invalid', password: 'memory-only-fixture' });
  assert.equal(attempt.state, 'pending');
  await assert.rejects(attempt.submit({}), { code: 'REGISTRATION_PENDING' });
  assert.deepEqual([...journal.values.values()], ['pending']);
  assert.equal(sends, 1);
  resolve(confirmed()); await first;
  assert.equal(attempt.state, 'confirmed');
  assert.equal(journal.values.size, 0);
  await assert.rejects(attempt.submit({}), { code: 'REGISTRATION_CONFIRMED' });
  assert.equal(sends, 1);
});

test('lost response after inert acceptance survives refresh and does not create a second account', async () => {
  const journal = storage(); let accepted = 0;
  const send = async () => { accepted++; throw new TypeError('Synthetic response lost after acceptance'); };
  const attempt = createTradeApplicationAttempt({ storage: journal, send });
  await assert.rejects(attempt.submit({}), { code: 'REGISTRATION_OUTCOME_UNKNOWN', outcomeUnknown: true });
  const restored = createTradeApplicationAttempt({ storage: journal, send });
  assert.equal(restored.state, 'unknown');
  await assert.rejects(restored.submit({}), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
  assert.equal(accepted, 1);
  assert.deepEqual([...journal.values.values()], ['unknown']);
});

test('two mounted forms share the tab marker and cannot send concurrently', async () => {
  const journal = storage(); let resolve; let sends = 0;
  const send = () => { sends++; return new Promise(r => { resolve = r; }); };
  const first = createTradeApplicationAttempt({ storage: journal, send });
  const second = createTradeApplicationAttempt({ storage: journal, send });
  const pending = first.submit({});
  await assert.rejects(second.submit({}), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
  resolve(confirmed()); await pending;
  assert.equal(sends, 1);
});

test('interrupted pending marker and unexpected stored state restore as unknown', () => {
  for (const value of ['pending', 'unknown', 'unexpected']) {
    const journal = storage(); journal.setItem('proto.trade-application-attempt.v1', value);
    assert.equal(createTradeApplicationAttempt({ storage: journal }).state, 'unknown');
  }
});

test('storage denied or silently dropped refuses a POST', async () => {
  for (const journal of [null, { getItem: () => null, setItem: () => { throw new Error('Denied'); } }, { getItem: () => null, setItem: () => {} }]) {
    let sends = 0;
    const attempt = createTradeApplicationAttempt({ storage: journal, send: async () => { sends++; return confirmed(); } });
    await assert.rejects(attempt.submit({}), { code: 'REGISTRATION_STORAGE_UNAVAILABLE' });
    assert.equal(sends, 0);
    assert.equal(attempt.state, 'unknown');
  }
});

test('only matching confirmed profile and verification flags allow success', () => {
  assert.equal(isConfirmedTradeApplication(confirmed()), true);
  assert.equal(isConfirmedTradeApplication({ ...confirmed(), verificationEmailSent: false }), true);
  for (const result of [{ ok: true, instantAccess: true, customerCode: 'XXXXXX' }, { ...confirmed(), profile: null }, { ...confirmed(), emailVerificationRequired: false }, { ...confirmed(), verificationEmailSent: 'true' }, { ...confirmed(), profile: { id: 'invalid' } }, {}]) {
    assert.equal(isConfirmedTradeApplication(result), false);
  }
});

test('malformed 200 or profile readback miss holds unknown without a retry', async () => {
  for (const result of [{ ok: true }, { ...confirmed(), profile: null }]) {
    let sends = 0;
    const attempt = createTradeApplicationAttempt({ storage: storage(), send: async () => { sends++; return result; } });
    await assert.rejects(attempt.submit({}), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
    await assert.rejects(attempt.submit({}), { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
    assert.equal(sends, 1);
  }
});

test('known pre-account rejection releases the journal for corrected safe retry', async () => {
  let sends = 0; const journal = storage();
  const attempt = createTradeApplicationAttempt({ storage: journal, send: async () => {
    sends++; if (sends === 1) throw failure(400, 'Please select at least one product category.'); return confirmed();
  } });
  await assert.rejects(attempt.submit({}), err => err.retrySafe && err.fieldErrors.productCategories && !err.message.includes('Private'));
  assert.equal(attempt.state, 'idle'); assert.equal(journal.values.size, 0);
  await attempt.submit({}); assert.equal(sends, 2);
});

test('known existing account, throttle and unavailable receipts offer fixed guidance', () => {
  const fixtures = [failure(409, 'private', 'EMAIL_ALREADY_REGISTERED'), failure(429, 'Too many registration attempts. Please try again later.'), failure(503, 'Registration is temporarily unavailable. Please try again later.')];
  for (const fixture of fixtures) { const err = applicationFailure(fixture); assert.equal(err.retrySafe, true); assert.equal(err.outcomeUnknown, false); assert.doesNotMatch(err.message, /Private|private/); }
});

test('unknown 400/createUser failure, 5xx, timeout and incomplete body never permit resubmission', () => {
  for (const fixture of [failure(400, 'uncatalogued error'), failure(400, 'private', 'ACCOUNT_CREATION_FAILED'), failure(500, 'Failed to create customer profile. Please try again.'), failure(503, 'private'), { code: 'REQUEST_TIMEOUT' }, { code: 'INVALID_RESPONSE' }]) {
    const err = applicationFailure(fixture); assert.equal(err.retrySafe, false); assert.equal(err.outcomeUnknown, true); assert.doesNotMatch(err.message, /private/i);
  }
});

test('cancelled request cannot turn a late acceptance into success or release retry hold', async () => {
  let resolve; const journal = storage();
  const attempt = createTradeApplicationAttempt({ storage: journal, send: () => new Promise(r => { resolve = r; }) });
  const pending = attempt.submit({}); attempt.cancel(); resolve(confirmed());
  await assert.rejects(pending, { code: 'REGISTRATION_OUTCOME_UNKNOWN' });
  assert.equal(attempt.state, 'unknown');
});
