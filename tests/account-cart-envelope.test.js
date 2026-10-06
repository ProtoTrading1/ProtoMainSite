import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedAccountCartEnvelope } from '../src/lib/accountCartEnvelope.mjs';
import { cartSyncFailure } from '../src/lib/cartSyncRecovery.mjs';

const line = { qty: 2, product: { id: 'synthetic-sku', isExtendedRange: true } };
test('verified receipt preserves all original basket/source bytes and accepts an empty account basket', () => {
  const data = { items: [line], revision: 0 };
  assert.equal(verifiedAccountCartEnvelope(data), data);
  assert.equal(data.items[0], line);
  assert.deepEqual(verifiedAccountCartEnvelope({ items: [], revision: 1 }), { items: [], revision: 1 });
});
test('incomplete success cannot adopt or silently filter an account basket', () => {
  for (const data of [null, {}, { items: [], revision: -1 }, { items: [], revision: 0.5 },
    { items: [line, { qty: 0, product: { id: 'bad' } }], revision: 4 },
    { items: [{ qty: 1, product: {} }], revision: 4 },
    { items: [{ qty: 1, product: { id: 'conflict', source: 'main', isExtendedRange: true } }], revision: 4 },
    { items: [{ qty: 10000, product: { id: 'bad' } }], revision: 4 },
    { items: Array(251).fill(line), revision: 4 }]) {
    const before = JSON.stringify(data);
    assert.throws(() => verifiedAccountCartEnvelope(data), { code: 'cart_response_unverified' });
    assert.equal(JSON.stringify(data), before);
  }
});
test('an unverified reply has a specific preserving diagnostic rather than a generic network error', () => {
  const issue = cartSyncFailure({ code: 'cart_response_unverified' });
  assert.equal(issue.code, 'cart_response_unverified');
  assert.match(issue.detail, /device basket is kept/);
  assert.match(issue.detail, /Do not clear/);
});
