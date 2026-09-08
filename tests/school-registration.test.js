import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('school registration site', () => {
  it('is a standalone deployable, separate from the trade portal build', () => {
    const pkg = JSON.parse(read('schools/package.json'));
    const vercel = JSON.parse(read('schools/vercel.json'));
    assert.equal(pkg.name, 'proto-schools-register');
    assert.equal(vercel.outputDirectory, 'dist');
    // The main portal must not pull the school app into its own bundle.
    assert.doesNotMatch(read('src/Root.jsx'), /schools\//);
  });

  it('collects the fields the school form promises', () => {
    const app = read('schools/src/App.jsx');
    assert.match(app, /SCHOOL_TYPES\.map/);
    for (const id of ['school-name', 'street-address', 'suburb', 'city', 'postal-code', 'province', 'contact-name', 'school-role', 'email', 'phone', 'password', 'confirm-password']) {
      assert.match(app, new RegExp(`id="${id}"`), `missing field ${id}`);
    }
    assert.match(app, /authorised/);
  });

  it('validates every required answer on the server, not just in the browser', () => {
    const api = read('schools/api/register-school.js');
    assert.match(api, /VALID_PROVINCES\.has\(normalizedProvince\)/);
    assert.match(api, /VALID_SCHOOL_TYPES\.has\(normalizedSchoolType\)/);
    assert.match(api, /!normalizedStreet/);
    assert.match(api, /!normalizedSuburb/);
    assert.match(api, /!normalizedCity/);
    assert.match(api, /test\(normalizedPostalCode\)/);
    assert.match(api, /VALID_SUPPLY_NEEDS\.has\(item\)/);
    assert.match(api, /authorised !== true/);
    assert.match(api, /password !== confirmPassword/);
    assert.match(api, /MIN_PASSWORD_LENGTH/);
  });

  it('grants a school instant access but still never mints a customer code', () => {
    const api = read('schools/api/register-school.js');
    // Deliberate: a school is not a competing reseller, so it skips the queue.
    assert.match(api, /is_approved: true/);
    assert.match(api, /customer_code: null/);
    assert.doesNotMatch(api, /allocateCustomerCode/);
  });

  it('records whether the school is public or private', () => {
    const fields = read('schools/src/lib/schoolFields.js');
    const api = read('schools/api/register-school.js');
    const migration = read('migrations/068_school_type.sql');
    assert.match(fields, /SCHOOL_TYPES = \['Public school', 'Private school'\]/);
    assert.match(api, /school_type: normalizedSchoolType/);
    // business_type mirrors it so the admin's existing filter works unchanged.
    assert.match(api, /business_type: normalizedSchoolType/);
    assert.match(migration, /add column if not exists school_type text/i);
  });

  it('stores the school address for delivery', () => {
    const api = read('schools/api/register-school.js');
    assert.match(api, /const schoolAddress = \[/);
    assert.match(api, /company_address: schoolAddress/);
    assert.match(api, /delivery_address: schoolAddress/);
    assert.match(api, /street_name: normalizedStreet/);
    assert.match(api, /postal_code: normalizedPostalCode/);
  });

  it('flags the row so the admin dashboard can badge it', () => {
    const api = read('schools/api/register-school.js');
    const migration = read('migrations/067_school_signup.sql');
    assert.match(api, /is_school: true/);
    assert.match(api, /school_role: normalizedRole/);
    assert.match(api, /supply_needs: normalizedSupplyNeeds/);
    assert.match(migration, /add column if not exists is_school boolean not null default false/i);
    assert.match(migration, /add column if not exists school_role text/i);
    assert.match(migration, /add column if not exists supply_needs text\[\]/i);
  });

  it('keeps signing up possible before the migration is applied', () => {
    const api = read('schools/api/register-school.js');
    // Progressive fallbacks drop the new columns rather than failing the signup.
    assert.match(api, /withoutColumns\('school_type'\)/);
    assert.match(api, /withoutColumns\('school_type', 'supply_needs', 'school_role', 'is_school'\)/);
    assert.match(api, /auth\.admin\.deleteUser\(userId\)/);
  });

  it('protects a public signup endpoint', () => {
    const api = read('schools/api/register-school.js');
    assert.match(api, /checkRateLimit/);
    assert.match(api, /company_fax: honeypot/);
    assert.match(api, /SUPABASE_SERVICE_ROLE_KEY/);
    // The service role key must never be shipped to the browser.
    assert.doesNotMatch(read('schools/src/App.jsx'), /SERVICE_ROLE/);
  });
});
