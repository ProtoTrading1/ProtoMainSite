import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeItemPreference } from '../lib/item-preference.mjs';
import { parseCartMutation, cartPayload } from '../api/account-cart.js';

test('preference is bounded, clean and retained by account basket serialization', () => {
  const now = 1800000000000;
  assert.equal(normalizeItemPreference(' blue\nbeads '), 'blue beads');
  assert.throws(() => normalizeItemPreference('x'.repeat(241)), { status: 400 });
  const parsed = parseCartMutation({ mode: 'save', revision: 1, activityAt: now, items: [{ qty: 1, preference: 'Blue beads', product: { id: '8618100133' } }] }, { now });
  assert.equal(cartPayload({ items: parsed.items, revision: 2, activity_at: now }).items[0].preference, 'Blue beads');
});
