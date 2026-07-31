import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  canonicalItemKey,
  cartPayload,
  parseCartMutation,
  resolveWholeCart,
} from '../api/account-cart.js';

const NOW = 1_800_000_000_000;

function item(id, qty = 1, extraProduct = {}) {
  return {
    product: {
      id,
      sku: id,
      code: id,
      name: `Product ${id}`,
      price: 12.5,
      ...extraProduct,
    },
    qty,
  };
}

function assertBadRequest(fn, pattern, statuses = [400]) {
  assert.throws(fn, (error) => {
    assert.ok(statuses.includes(error?.status), `expected ${statuses.join(' or ')}, received ${error?.status}`);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

describe('account basket mutation validation', () => {
  it('canonicalises product identity and accepts a valid save mutation', () => {
    assert.equal(canonicalItemKey(item('  abc-123  ')), 'ABC-123');

    const parsed = parseCartMutation({
      mode: 'save',
      items: [item('abc-123', 7)],
      activityAt: NOW - 1_000,
      revision: 4,
    }, { now: NOW });

    assert.equal(parsed.mode, 'save');
    assert.equal(parsed.revision, 4);
    assert.equal(parsed.activityAt, NOW - 1_000);
    assert.equal(parsed.items.length, 1);
    assert.equal(canonicalItemKey(parsed.items[0]), 'ABC-123');
    assert.equal(parsed.items[0].qty, 7);
  });

  it('rejects 251 lines instead of silently truncating the customer basket', () => {
    const items = Array.from({ length: 251 }, (_, index) => item(`SKU-${index + 1}`));
    assertBadRequest(() => parseCartMutation({
      mode: 'save',
      items,
      activityAt: NOW - 1_000,
      revision: 0,
    }, { now: NOW }), /250|lines/i, [400, 413]);
  });

  it('rejects invalid quantities rather than coercing them into a different order', () => {
    for (const qty of [0, -1, 1.5, 10_000, '2', null]) {
      assertBadRequest(() => parseCartMutation({
        mode: 'save',
        items: [item('SKU-1', qty)],
        activityAt: NOW - 1_000,
        revision: 0,
      }, { now: NOW }), /quantity/i);
    }
  });

  it('rejects malformed revisions and activity timestamps', () => {
    for (const revision of [-1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
      assertBadRequest(() => parseCartMutation({
        mode: 'save',
        items: [item('SKU-1')],
        activityAt: NOW - 1_000,
        revision,
      }, { now: NOW }), /revision/i);
    }

    for (const activityAt of [0, -1, 1.5, '123', NOW + 60_001]) {
      assertBadRequest(() => parseCartMutation({
        mode: 'save',
        items: [item('SKU-1')],
        activityAt,
        revision: 0,
      }, { now: NOW }), /activity/i);
    }
  });

  it('requires a revision for save and clear, while initial merge may omit it', () => {
    assertBadRequest(() => parseCartMutation({
      mode: 'save', items: [], activityAt: NOW - 1_000,
    }, { now: NOW }), /revision/i);

    assertBadRequest(() => parseCartMutation({
      revision: undefined,
    }, { method: 'DELETE', now: NOW }), /revision/i);

    const merge = parseCartMutation({
      mode: 'merge', items: [item('SKU-1')], activityAt: NOW - 1_000,
    }, { now: NOW });
    assert.equal(merge.mode, 'merge');
    assert.equal(merge.revision, null);
  });
});

describe('whole-basket conflict semantics', () => {
  it('imports a browser basket only when the account has no server basket yet', () => {
    const incoming = [item('FIRST-1', 4), item('FIRST-2', 2)];

    assert.deepEqual(resolveWholeCart(null, incoming, NOW - 1_000), {
      items: incoming,
      activityAt: NOW - 1_000,
      changed: true,
    });
  });

  it('lets a legacy populated browser seed an untouched empty server placeholder', () => {
    const incoming = [item('LEGACY-1', 7)];
    const untouchedEmptyRow = { items: [], activity_at: null, revision: 1 };

    assert.deepEqual(resolveWholeCart(untouchedEmptyRow, incoming, NOW - 1_000), {
      items: incoming,
      activityAt: NOW - 1_000,
      changed: true,
    });
  });

  it('never resurrects a basket that was deliberately cleared on the server', () => {
    const clearedRow = { items: [], activity_at: NOW - 2_000, revision: 9 };
    const resolved = resolveWholeCart(clearedRow, [item('STALE-1', 3)], NOW - 1_000);

    assert.deepEqual(resolved.items, []);
    assert.equal(resolved.activityAt, NOW - 2_000);
    assert.equal(resolved.changed, false);
  });

  it('does not let a stale empty browser clear an existing account basket at login', () => {
    const current = {
      items: [item('OLD-1', 4), item('OLD-2', 2)],
      activity_at: NOW - 10_000,
      revision: 8,
    };

    const resolved = resolveWholeCart(current, [], NOW - 1_000);
    assert.deepEqual(resolved.items.map(canonicalItemKey), ['OLD-1', 'OLD-2']);
    assert.deepEqual(resolved.items.map(({ qty }) => qty), [4, 2]);
    assert.equal(resolved.activityAt, NOW - 10_000);
    assert.equal(resolved.changed, false);
  });

  it('does not let a stale populated browser replace an existing account basket at login', () => {
    const current = {
      items: [item('KEEP', 1), item('REMOVED', 9)],
      activity_at: NOW - 10_000,
      revision: 3,
    };
    const incoming = [item('KEEP', 2), item('NEW', 5)];

    const resolved = resolveWholeCart(current, incoming, NOW - 1_000);
    assert.deepEqual(resolved.items.map(canonicalItemKey), ['KEEP', 'REMOVED']);
    assert.deepEqual(resolved.items.map(({ qty }) => qty), [1, 9]);
    assert.equal(resolved.changed, false);
  });

  it('retains the server snapshot regardless of browser clock skew', () => {
    const current = {
      items: [item('SERVER', 6)],
      activity_at: NOW - 1_000,
      revision: 5,
    };

    for (const activityAt of [NOW - 2_000, NOW - 1_000, NOW + 60_000]) {
      const resolved = resolveWholeCart(current, [item('STALE', 1)], activityAt);
      assert.deepEqual(resolved.items.map(canonicalItemKey), ['SERVER']);
      assert.equal(resolved.activityAt, NOW - 1_000);
      assert.equal(resolved.changed, false);
    }
  });

  it('returns a stable canonical payload suitable for a 409 retry', () => {
    const conflict = cartPayload({
      items: [item(' abc ', 3)],
      activity_at: NOW - 1_000,
      revision: 12,
    });

    assert.equal(conflict.revision, 12);
    assert.equal(conflict.activityAt, NOW - 1_000);
    assert.equal(conflict.items.length, 1);
    assert.equal(canonicalItemKey(conflict.items[0]), 'ABC');
    assert.equal(conflict.items[0].qty, 3);
  });

  it('uses an atomic revision predicate and turns insert races into conflicts', async () => {
    const api = await readFile(new URL('../api/account-cart.js', import.meta.url), 'utf8');

    assert.match(api, /\.update\(values\)[\s\S]*?\.eq\('customer_id', customerId\)[\s\S]*?\.eq\('revision', expectedRevision\)/);
    assert.match(api, /error\.code === '23505'[\s\S]*?sendFreshConflict/);
    assert.match(api, /res\.status\(409\)\.json\(\{[\s\S]*?\.\.\.cartPayload\(/);
  });
});

describe('account basket client orchestration contract', () => {
  it('serialises/coalesces saves and retries conflicts without server-wins replacement', async () => {
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

    assert.match(app, /cart(?:Save|Sync)(?:Queue|Chain|InFlight|Pending)/i);
    assert.match(app, /error\.status === 409/);
    assert.match(app, /saveAccountCart\(/);
    assert.doesNotMatch(app, /setCartItems\(error\.data(?:\?\.)?\.items\)/);
  });

  it('refreshes the account basket when an existing browser regains focus', async () => {
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

    assert.match(app, /getAccountCart/);
    assert.match(app, /visibilitychange/);
    assert.match(app, /document\.visibilityState === 'visible'/);
    assert.match(app, /window\.addEventListener\('focus'/);
  });

  it('makes clear revision-aware and sends it through the same mutation ordering path', async () => {
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const client = await readFile(new URL('../src/lib/accountCart.js', import.meta.url), 'utf8');

    assert.match(client, /clearAccountCart\(revision, activityAt\)/);
    assert.match(client, /requestAccountCart\('DELETE', \{ revision, activityAt \}\)/);
    assert.match(app, /clearAccountCart\(cartRevisionRef\.current, operation\.activityAt\)/);
    assert.match(app, /if \(fingerprint === '\[\]'\)[\s\S]*?type: 'clear'[\s\S]*?activityAt:/);
    assert.match(app, /makeCartSyncOperation\([\s\S]*?cartClearActivityAtRef\.current[\s\S]*?nextOperation\.type === 'clear'/);
    assert.match(app, /cart(?:Save|Sync)(?:Queue|Chain|InFlight|Pending)/i);
  });

  it('shows account sync failures and gives customers an explicit retry action', async () => {
    const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
    const drawer = await readFile(new URL('../src/components/Drawer.jsx', import.meta.url), 'utf8');

    assert.match(app, /setCartSyncStatus\('error'\)/);
    assert.match(app, /const retryCartSync = useCallback/);
    assert.match(app, /cartHydrateRetryRef\.current/);
    assert.match(app, /onRetryCartSync=\{retryCartSync\}/);
    assert.match(drawer, /role="alert"/);
    assert.match(drawer, /Basket sync needs attention/);
    assert.match(drawer, /We cannot confirm this basket on your account/);
    assert.match(drawer, /onClick=\{onRetryCartSync\}>Retry sync/);
  });
});
