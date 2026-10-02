import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsSessionId } from '../src/lib/analyticsSession.js';
test('shared session creates a stable UUID before presence and survives storage denial', () => {
  const original = globalThis.sessionStorage;
  const rows = new Map();
  globalThis.sessionStorage = { getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value) };
  const first = analyticsSessionId();
  assert.equal(rows.get('proto_journey_session'), first); assert.equal(analyticsSessionId(), first);
  globalThis.sessionStorage = { getItem() { throw new Error('blocked'); } };
  assert.equal(analyticsSessionId(), first); assert.equal(analyticsSessionId(), first);
  globalThis.sessionStorage = original;
});
