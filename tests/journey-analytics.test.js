import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeJourneyEvent } from '../api/_journey-event.js';

const SESSION_ID = 'a9894746-a04f-4d6d-82b3-4a3819354565';

test('accepts a privacy-safe journey event', () => {
  assert.deepEqual(normalizeJourneyEvent({
    eventType: 'checkout_started',
    journey: 'checkout',
    step: 'review',
    outcome: 'opened',
    sessionId: SESSION_ID,
    metadata: { line_count: 12, retry: false, source: 'basket' },
  }), {
    event_type: 'checkout_started',
    journey: 'checkout',
    step: 'review',
    outcome: 'opened',
    session_id: SESSION_ID,
    metadata: { line_count: 12, retry: false, source: 'basket' },
  });
});
test('rejects unknown events, journeys and session identifiers', () => {
  assert.throws(() => normalizeJourneyEvent({
    eventType: 'customer_email_collected', journey: 'registration', sessionId: SESSION_ID,
  }), /Invalid event type/);
  assert.throws(() => normalizeJourneyEvent({
    eventType: 'registration_started', journey: 'marketing', sessionId: SESSION_ID,
  }), /Invalid journey/);
  assert.throws(() => normalizeJourneyEvent({
    eventType: 'registration_started', journey: 'registration', sessionId: 'visitor-1',
  }), /Invalid session/);
});

test('drops metadata keys and values that could carry customer-entered text', () => {
  const event = normalizeJourneyEvent({
    eventType: 'registration_failed',
    journey: 'registration',
    sessionId: SESSION_ID,
    metadata: {
      error_code: 'email_exists',
      email: 'customer@example.com',
      notes: 'Please call me',
      source: 'registration',
      recovery_action: 'reset_password',
    },
  });
  assert.deepEqual(event.metadata, {
    error_code: 'email_exists',
    source: 'registration',
    recovery_action: 'reset_password',
  });
});

test('migration and API keep the funnel service-role-only', () => {
  const migration = fs.readFileSync(new URL('../migrations/059_customer_journey_analytics.sql', import.meta.url), 'utf8');
  const api = fs.readFileSync(new URL('../api/journey-analytics.js', import.meta.url), 'utf8');
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all.+anon, authenticated/is);
  assert.match(migration, /grant select, insert, delete.+service_role/is);
  assert.match(api, /SAFE|normalizeJourneyEvent|customer_journey_events/);
});
