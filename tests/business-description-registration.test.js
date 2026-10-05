import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateRegistrationStep } from '../src/lib/registrationValidation.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('business description registration contract', () => {
  it('requires and persists an applicant business description', () => {
    const page = read('src/pages/LandingPage.jsx');
    const api = read('api/register-trade.js');
    assert.match(page, /firstInvalidRegistrationStep\(formValues\)/);
    const values = { tradingChannels: ['Retail store'], productCategories: ['Gifts'] };
    assert.ok(validateRegistrationStep(3, { ...values, businessDescription: 'short' }).businessDescription);
    assert.equal(validateRegistrationStep(3, { ...values, businessDescription: 'Wholesale gifts sold to shops.' }).businessDescription, undefined);
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
    const types = read('src/lib/businessTypes.js');
    assert.doesNotMatch(types, /Craft & hobby shop/);
    assert.doesNotMatch(types, /Craft & bead shop/);
    assert.doesNotMatch(types, /Educational supplier/);
    assert.match(types, /Art, craft & beads/);
    assert.match(types, /Stationery & educational products/);
  });

  it('stores trading channels and product categories separately', () => {
    const api = read('api/register-trade.js');
    const migration = read('migrations/063_business_classification.sql');
    assert.match(api, /sales_channels: normalizedSalesChannels/);
    assert.match(api, /product_categories: normalizedProductCategories/);
    assert.match(migration, /add column if not exists sales_channels text\[\]/i);
    assert.match(migration, /add column if not exists product_categories text\[\]/i);
  });

  it('allows an inert Step 4 visual check on Vercel previews only', () => {
    const page = read('src/pages/LandingPage.jsx');
    assert.match(page, /hostname\.endsWith\('\.vercel\.app'\)/);
    assert.match(page, /get\('previewStep'\) === 'business'/);
  });
});
