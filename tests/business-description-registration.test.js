import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('business description registration contract', () => {
  it('requires and persists an applicant business description', () => {
    const page = read('src/pages/LandingPage.jsx');
    const api = read('api/register-trade.js');
    assert.match(page, /businessDescription\.trim\(\)\.length >= 20/);
    assert.match(api, /business_description: normalizedBusinessDescription/);
    assert.match(api, /normalizedBusinessDescription\.length < 20/);
  });

  it('keeps the database change separate and backward compatible', () => {
    const migration = read('migrations/062_business_description.sql');
    const api = read('api/register-trade.js');
    assert.match(migration, /add column if not exists business_description text/i);
    assert.match(api, /payloadWithoutNewColumns/);
  });

  it('does not show duplicate gift categories', () => {
    assert.doesNotMatch(read('src/lib/businessTypes.js'), /^\s*'Gift shop',/m);
    assert.doesNotMatch(read('src/pages/LandingPage.jsx'), /^\s*'Gift shop',/m);
  });
});
