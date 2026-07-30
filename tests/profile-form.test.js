import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProfileForm,
  buildProfilePatch,
  validateProfileForm,
} from '../src/lib/profileForm.js';

test('a known business type preselects its dropdown option', () => {
  const form = buildProfileForm({ business_type: 'Retail store' });
  assert.equal(form.business_type, 'Retail store');
  assert.equal(form.business_type_other, '');
});

test('an unknown business type falls back to Other and keeps the original text', () => {
  // Registration writes a comma-joined multi-select; admins type free text.
  const form = buildProfileForm({ business_type: 'Retailer' });
  assert.equal(form.business_type, 'Other');
  assert.equal(form.business_type_other, 'Retailer');
  // Round-tripping without touching the field must not change what is stored.
  assert.equal(buildProfilePatch(form).business_type, 'Retailer');
});

test('a blank business type leaves the dropdown unselected', () => {
  const form = buildProfileForm({});
  assert.equal(form.business_type, '');
  assert.equal(form.business_type_other, '');
  assert.equal(buildProfilePatch(form).business_type, null);
});

test('country defaults to South Africa when the row has none', () => {
  assert.equal(buildProfileForm({}).country, 'South Africa');
  assert.equal(buildProfileForm({ country: 'Namibia' }).country, 'Namibia');
});

test('saving writes the structured columns and recomposes delivery_address', () => {
  const patch = buildProfilePatch(buildProfileForm({
    street_name: '12 Main Road',
    suburb: 'Glenhazel',
    city: 'Johannesburg',
    postal_code: '2192',
    province: 'Gauteng',
    country: 'South Africa',
    building_type: 'House',
  }));
  assert.equal(patch.street_name, '12 Main Road');
  assert.equal(patch.suburb, 'Glenhazel');
  assert.equal(patch.city, 'Johannesburg');
  assert.equal(patch.postal_code, '2192');
  assert.equal(patch.province, 'Gauteng');
  assert.equal(patch.delivery_address, '12 MAIN ROAD, GLENHAZEL, JOHANNESBURG, 2192, HOUSE');
});

test('an apartment keeps its unit number in the printed address line', () => {
  const patch = buildProfilePatch({
    ...buildProfileForm({ street_name: '5 Oak Ave', suburb: 'Sea Point', city: 'Cape Town', postal_code: '8005' }),
    building_type: 'Apartments',
    unit_number: '14B',
  });
  assert.equal(patch.unit_number, '14B');
  assert.match(patch.delivery_address, /UNIT 14B$/);
});

test('a unit number is dropped when the building is not an apartment', () => {
  const patch = buildProfilePatch({
    ...buildProfileForm({ street_name: '5 Oak Ave', suburb: 'Sea Point', city: 'Cape Town', postal_code: '8005' }),
    building_type: 'House',
    unit_number: '14B',
  });
  assert.equal(patch.unit_number, null);
  assert.doesNotMatch(patch.delivery_address, /14B/);
});

test('province is cleared when the customer moves outside South Africa', () => {
  const patch = buildProfilePatch({
    ...buildProfileForm({ province: 'Gauteng' }),
    country: 'Namibia',
  });
  assert.equal(patch.country, 'Namibia');
  assert.equal(patch.province, null);
});

test('a legacy free-text delivery_address is never blanked by an empty form', () => {
  // No structured columns yet — the patch must leave delivery_address alone
  // rather than overwriting the only address on the account with ''.
  const patch = buildProfilePatch(buildProfileForm({ delivery_address: '12 OLD ROAD, DURBAN' }));
  assert.ok(!('delivery_address' in patch));
});

test('a half-filled address is rejected before it reaches the database', () => {
  const form = { ...buildProfileForm({}), street_name: '12 Main Road' };
  assert.match(validateProfileForm(form), /full delivery address/);
});

test('a complete address passes validation', () => {
  const form = buildProfileForm({
    street_name: '12 Main Road', suburb: 'Glenhazel', city: 'Johannesburg', postal_code: '2192',
  });
  assert.equal(validateProfileForm(form), '');
});

test('Other selections must be described', () => {
  assert.match(
    validateProfileForm({ ...buildProfileForm({}), business_type: 'Other', business_type_other: '  ' }),
    /describe your type of business/,
  );
  assert.match(
    validateProfileForm({ ...buildProfileForm({}), building_type: 'Other', building_type_other: '' }),
    /describe your building type/,
  );
  assert.match(
    validateProfileForm({ ...buildProfileForm({}), building_type: 'Apartments', unit_number: '' }),
    /unit \/ apartment number/,
  );
});

test('the patch never carries privileged columns', () => {
  const patch = buildProfilePatch({
    ...buildProfileForm({}),
    role: 'admin',
    tier: 'premium',
    is_approved: true,
    customer_code: 'HACKED',
  });
  for (const key of ['role', 'tier', 'is_approved', 'customer_code']) {
    assert.ok(!(key in patch), `${key} must not be writable from the profile form`);
  }
});
