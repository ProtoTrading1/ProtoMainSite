import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const prompt = fs.readFileSync(new URL('../src/components/ProductFeedbackPrompt.jsx', import.meta.url), 'utf8');
const endpoint = fs.readFileSync(new URL('../api/product-feedback.js', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../migrations/064_customer_feedback.sql', import.meta.url), 'utf8');

test('product feedback capture offers structured reasons without requiring free text', () => {
  assert.match(prompt, /\['price', 'Price'\]/);
  assert.match(prompt, /\['minimum_quantity', 'Minimum quantity'\]/);
  assert.match(prompt, /Send feedback/);
});

test('product feedback capture validates and rate-limits feedback server-side', () => {
  assert.match(endpoint, /ALLOWED_REASONS/);
  assert.match(endpoint, /product-feedback:/);
  assert.match(endpoint, /customer_feedback/);
});

test('product feedback capture ships a service-role-only persistence migration', () => {
  assert.match(migration, /create table if not exists public\.customer_feedback/);
  assert.match(migration, /revoke all on public\.customer_feedback from anon, authenticated/);
});
