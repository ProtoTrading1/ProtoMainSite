import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const landingSource = await readFile(
  new URL('../../src/pages/LandingPage.jsx', import.meta.url),
  'utf8',
);

function fieldMarkup(id) {
  const start = landingSource.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `expected registration field ${id}`);

  const end = landingSource.indexOf('/>', start);
  assert.notEqual(end, -1, `expected registration field ${id} to close`);
  return landingSource.slice(start, end);
}

test('registration labels are explicitly associated with stable field IDs', () => {
  const labelledFields = [
    ['trade-company-name', 'Company name'],
    ['trade-contact-name', 'Contact person name and surname'],
    ['trade-vat-number', 'VAT number'],
    ['trade-email', 'Email address'],
    ['trade-phone', 'Phone number'],
    ['trade-new-password', 'Password'],
  ];

  for (const [id, label] of labelledFields) {
    assert.match(
      landingSource,
      new RegExp(`<label htmlFor="${id}">\\s*${label}`),
      `${label} should target ${id}`,
    );
  }
});

test('registration fields expose mobile-friendly names and autofill metadata', () => {
  const expectations = [
    ['trade-company-name', 'business_name', 'organization'],
    ['trade-contact-name', 'contact_name', 'name'],
    ['trade-vat-number', 'vat_number', 'off'],
    ['trade-email', 'email', 'email'],
    ['trade-phone', 'phone', 'tel'],
    ['trade-new-password', 'password', 'new-password'],
  ];

  for (const [id, name, autoComplete] of expectations) {
    const field = fieldMarkup(id);
    assert.match(field, new RegExp(`name="${name}"`), `${id} should have a stable name`);
    assert.match(
      field,
      new RegExp(`autoComplete="${autoComplete}"`),
      `${id} should declare its autofill purpose`,
    );
  }

  assert.match(fieldMarkup('trade-vat-number'), /inputMode="numeric"/);
  assert.match(fieldMarkup('trade-email'), /inputMode="email"/);
  assert.match(fieldMarkup('trade-phone'), /inputMode="tel"/);
});

test('email validation feedback is programmatically linked to the email field', () => {
  assert.match(fieldMarkup('trade-email'), /aria-describedby=\{emailError \? 'trade-email-error' : undefined\}/);
  assert.match(landingSource, /<span id="trade-email-error"/);
});
