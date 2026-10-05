import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstInvalidRegistrationStep, REGISTRATION_FIELD_IDS, REGISTRATION_FIELD_STEPS, registrationEmailCheckFailure, registrationErrorId, validateRegistrationEmail, validateRegistrationStep } from '../src/lib/registrationValidation.mjs';
import { checkRegistrationEmail } from '../src/lib/registrationEmailCheck.js';

const valid = () => ({
  companyName: 'Synthetic Trade', contactName: 'Synthetic Applicant', email: 'applicant@synthetic.test',
  phone: '+27 21 555 0123', password: 'fixture-only-password', whatsappOptIn: false, country: 'South Africa',
  billingStreet: '1 Synthetic Street', billingSuburb: 'Synthetic Suburb', billingCity: 'Synthetic City', billingPostalCode: '0001',
  streetName: '2 Fixture Road', suburb: 'Fixture Suburb', city: 'Fixture City', postalCode: '0002', buildingType: 'House',
  otherBuildingType: '', unitNumber: '', tradingChannels: ['Physical retail store'],
  productCategories: ['Gifts & novelty products'], otherProductCategory: '', businessDescription: 'Synthetic gifts sold to fixture customers.',
});

test('all four existing registration steps accept a complete synthetic application without optional details', () => {
  for (let step = 0; step < 4; step += 1) assert.deepEqual(validateRegistrationStep(step, valid()), {});
  assert.equal(firstInvalidRegistrationStep(valid()), null);
});

for (const [step, fields] of [
  [0, ['companyName', 'contactName']],
  [1, ['email', 'phone', 'password', 'whatsappOptIn']],
  [2, ['country', 'billingStreet', 'billingSuburb', 'billingCity', 'billingPostalCode', 'streetName', 'suburb', 'city', 'postalCode', 'buildingType']],
  [3, ['tradingChannels', 'productCategories', 'businessDescription']],
]) {
  test(`step ${step + 1} returns a separate missing message for every required field`, () => {
    const errors = validateRegistrationStep(step, {});
    assert.deepEqual(Object.keys(errors).sort(), [...fields].sort());
    for (const [key, message] of Object.entries(errors)) {
      assert.ok(message.length > 10, key);
      assert.ok(REGISTRATION_FIELD_IDS[key], key);
      assert.equal(REGISTRATION_FIELD_STEPS[key], step, key);
    }
  });
  for (const key of fields.filter((field) => !['whatsappOptIn', 'tradingChannels', 'productCategories', 'password'].includes(field))) {
    test(`${key} treats whitespace as missing`, () => {
      assert.ok(validateRegistrationStep(step, { ...valid(), [key]: '   ' })[key]);
    });
  }
}

test('email validation handles blank, malformed, blocked and normalised addresses locally', () => {
  for (const value of ['', '  ', 'missing-at.test', 'name@', 'name@business', 'name with spaces@business.co.za', 'name@-invalid.co.za']) {
    assert.ok(validateRegistrationEmail(value), value);
  }
  assert.match(validateRegistrationEmail('fixture@example.com'), /real business email/);
  assert.equal(validateRegistrationEmail('  First.Last+Trade@SYNTHETIC.test  '), '');
});

for (const [serverMessage, expected] of [
  ['Please enter your email address.', /Enter your email address/],
  ['Please enter a valid email address (e.g. name@company.co.za).', /valid email address/],
  ['Please use your real business email address - temporary or test addresses are not accepted.', /Temporary or test addresses/],
  ['Please use your real business email address.', /real business email/],
]) {
  test(`fixed email-check 400 response maps to field guidance: ${serverMessage}`, () => {
    const guidance = registrationEmailCheckFailure({ status: 400, data: { error: serverMessage } });
    assert.equal(guidance.kind, 'validation');
    assert.match(guidance.fieldError, expected);
    assert.doesNotMatch(guidance.message, /connection/);
  });
}

test('server-only blocked domain rejection becomes email field feedback through the inert client contract', async (t) => {
  const address = 'applicant@sharklasers.com';
  assert.equal(validateRegistrationEmail(address), '', 'existing client policy remains unchanged');
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'Please use your real business email address - temporary or test addresses are not accepted.' }), { status: 400, headers: { 'content-type': 'application/json' } }));
  await assert.rejects(checkRegistrationEmail(address), (error) => {
    const guidance = registrationEmailCheckFailure(error);
    assert.equal(guidance.kind, 'validation');
    assert.match(guidance.fieldError, /real business email/);
    assert.doesNotMatch(guidance.message, /connection/);
    return true;
  });
});

for (const [error, kind, message] of [
  [{ status: 429, data: { error: 'PRIVATE SERVER DETAILS' } }, 'rate_limit', /Please wait/],
  [{ status: 503, data: { error: 'PRIVATE SERVER DETAILS' } }, 'server', /temporarily unavailable/],
  [{ status: 500, data: { error: 'PRIVATE SERVER DETAILS' } }, 'server', /temporarily unavailable/],
  [{ code: 'REQUEST_TIMEOUT', name: 'RequestTimeoutError', message: 'PRIVATE SERVER DETAILS' }, 'timeout', /took too long/],
  [new TypeError('PRIVATE SERVER DETAILS'), 'network', /could not connect/],
  [{ status: 400, data: { error: 'PRIVATE SERVER DETAILS' } }, 'unconfirmed', /could not confirm/],
]) {
  test(`email-check ${kind} failure has distinct fixed guidance and exposes no response text`, () => {
    const guidance = registrationEmailCheckFailure(error);
    assert.equal(guidance.kind, kind);
    assert.equal(guidance.fieldError, '');
    assert.match(guidance.message, message);
    assert.match(guidance.message, /has not been submitted/);
    assert.doesNotMatch(JSON.stringify(guidance), /PRIVATE SERVER DETAILS/);
  });
}

test('known validation text from an unexpected status or coded error is not mistaken for field rejection', () => {
  const data = { error: 'Please use your real business email address.' };
  assert.equal(registrationEmailCheckFailure({ status: 503, data }).kind, 'server');
  assert.equal(registrationEmailCheckFailure({ status: 400, code: 'PROVIDER_FAILURE', data }).kind, 'unconfirmed');
});

test('phone feedback distinguishes missing and too few digits without changing the eight digit rule', () => {
  assert.match(validateRegistrationStep(1, { ...valid(), phone: '' }).phone, /Enter your phone number/);
  assert.match(validateRegistrationStep(1, { ...valid(), phone: '+27 123' }).phone, /at least 8 digits/);
  assert.equal(validateRegistrationStep(1, { ...valid(), phone: '0123 4567' }).phone, undefined);
});

test('password boundary follows the intended ten characters and the helper neither trims nor persists passwords', () => {
  assert.match(validateRegistrationStep(1, { ...valid(), password: '' }).password, /Create a password/);
  assert.match(validateRegistrationStep(1, { ...valid(), password: '123456789' }).password, /at least 10/);
  assert.equal(validateRegistrationStep(1, { ...valid(), password: '1234567890' }).password, undefined);
  // Existing policy counts characters; changing complexity or whitespace policy is outside this fix.
  assert.equal(validateRegistrationStep(1, { ...valid(), password: '          ' }).password, undefined);
});

test('WhatsApp requires an explicit decision and accepts a decline', () => {
  for (const value of [undefined, null, '', 'false', 0]) assert.ok(validateRegistrationStep(1, { ...valid(), whatsappOptIn: value }).whatsappOptIn);
  for (const value of [true, false]) assert.equal(validateRegistrationStep(1, { ...valid(), whatsappOptIn: value }).whatsappOptIn, undefined);
});

test('building details become required only for the selected building type', () => {
  assert.ok(validateRegistrationStep(2, { ...valid(), buildingType: 'Apartments', unitNumber: ' ' }).unitNumber);
  assert.equal(validateRegistrationStep(2, { ...valid(), buildingType: 'Apartments', unitNumber: '7' }).unitNumber, undefined);
  assert.ok(validateRegistrationStep(2, { ...valid(), buildingType: 'Other', otherBuildingType: ' ' }).otherBuildingType);
  assert.equal(validateRegistrationStep(2, { ...valid(), buildingType: 'Other', otherBuildingType: 'Warehouse' }).otherBuildingType, undefined);
  assert.equal(validateRegistrationStep(2, valid()).unitNumber, undefined);
  assert.equal(validateRegistrationStep(2, valid()).otherBuildingType, undefined);
});

test('South African province remains optional and international addresses remain valid', () => {
  assert.deepEqual(validateRegistrationStep(2, { ...valid(), province: '' }), {});
  assert.deepEqual(validateRegistrationStep(2, { ...valid(), country: 'Namibia', province: '' }), {});
});

test('trading channels, product interests and an Other description are required independently', () => {
  const missing = validateRegistrationStep(3, { ...valid(), tradingChannels: [], productCategories: [] });
  assert.ok(missing.tradingChannels);
  assert.ok(missing.productCategories);
  assert.ok(validateRegistrationStep(3, { ...valid(), productCategories: ['Other'], otherProductCategory: ' ' }).otherProductCategory);
  assert.deepEqual(validateRegistrationStep(3, { ...valid(), productCategories: ['Other'], otherProductCategory: 'Synthetic supplies' }), {});
});

test('business description boundary counts trimmed text and gives a specific short-detail message', () => {
  assert.match(validateRegistrationStep(3, { ...valid(), businessDescription: 'x'.repeat(19) }).businessDescription, /Add more detail/);
  assert.equal(validateRegistrationStep(3, { ...valid(), businessDescription: `  ${'x'.repeat(20)}  ` }).businessDescription, undefined);
  assert.ok(validateRegistrationStep(3, { ...valid(), businessDescription: 'x'.repeat(19) + ' ' }).businessDescription);
});

test('final validation returns the first affected step including a password cleared after a safe failure', () => {
  assert.deepEqual(firstInvalidRegistrationStep({ ...valid(), companyName: '' }), { step: 0, errors: { companyName: 'Enter your company name.' } });
  const retry = firstInvalidRegistrationStep({ ...valid(), password: '' });
  assert.equal(retry.step, 1);
  assert.deepEqual(Object.keys(retry.errors), ['password']);
  assert.equal(firstInvalidRegistrationStep({ ...valid(), buildingType: '' }).step, 2);
  assert.equal(firstInvalidRegistrationStep({ ...valid(), tradingChannels: [] }).step, 3);
});

test('validation does not mutate input or expose entered values in messages', () => {
  const values = valid();
  values.email = 'PRIVATE SENTINEL';
  values.password = 'SECRET';
  const before = structuredClone(values);
  for (let step = 0; step < 4; step += 1) {
    const messages = JSON.stringify(validateRegistrationStep(step, values));
    assert.ok(!messages.includes('PRIVATE SENTINEL'));
    assert.ok(!messages.includes('SECRET'));
  }
  assert.deepEqual(values, before);
});

test('each validation error has a stable unique focus target and description id', () => {
  assert.equal(new Set(Object.values(REGISTRATION_FIELD_IDS)).size, Object.keys(REGISTRATION_FIELD_IDS).length);
  for (const key of Object.keys(REGISTRATION_FIELD_IDS)) assert.equal(registrationErrorId(key), `${REGISTRATION_FIELD_IDS[key]}-error`);
});

test('the rendered registration form uses validated fields, linked summary, pending lock and unknown hold', () => {
  const page = readFileSync(new URL('../src/pages/LandingPage.jsx', import.meta.url), 'utf8');
  const addresses = readFileSync(new URL('../src/components/register/BillingDeliveryFields.jsx', import.meta.url), 'utf8');
  const autocomplete = readFileSync(new URL('../src/components/AddressAutocomplete.jsx', import.meta.url), 'utf8');
  assert.match(page, /validateRegistrationStep\(step, formValues\)/);
  assert.match(page, /firstInvalidRegistrationStep\(formValues\)/);
  assert.match(page, /role="alert" tabIndex=\{-1\}/);
  assert.match(page, /focusField\(key\)/);
  assert.match(page, /submissionLockRef\.current \|\| outcomeUnknown/);
  assert.match(page, /fieldset className="lp-register-fields" disabled=\{submitting\}/);
  assert.match(page, /attemptRef\.current\.submit\(/);
  assert.match(page, /result\?\.ok === true/);
  assert.match(page, /resendLockRef\.current/);
  assert.match(page, /if \(!mountedRef\.current\) return/);
  assert.match(page, /Application not sent — browser storage needed/);
  assert.match(page, /setPassword\(''\)/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|console\.log/);
  assert.match(addresses, /fieldError=\{fieldError\}/);
  assert.match(autocomplete, /aria-describedby=\{ariaDescribedBy\}/);
});
