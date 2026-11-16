import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCollection } from '../src/lib/collectionFilter.js';
import { sortNewArrivals } from '../src/lib/newArrivalOrder.js';

test('new arrivals appear newest first without changing the source', () => {
  const products = [{ id: 'older', createdAt: '2026-10-20T10:00:00Z' }, { id: 'newer', createdAt: '2026-11-16T10:00:00Z' }];
  assert.deepEqual(sortNewArrivals(products).map((p) => p.id), ['newer', 'older']);
  assert.equal(products[0].id, 'older');
});

test('new arrivals and curated specials remain separate collections', () => {
  const arrivals = [
    { id: '8626000807', isNew: true },
    { id: '8626000808', isNew: true },
    { id: '8626000809', isNew: true },
    { id: 'deal', isNew: false },
  ];
  assert.deepEqual(applyCollection(arrivals, 'just-added').map((p) => p.id), ['8626000807', '8626000808', '8626000809']);
  assert.deepEqual(applyCollection(arrivals, 'specials', new Set(['deal'])).map((p) => p.id), ['deal']);
  assert.deepEqual(applyCollection(arrivals, 'specials', new Set()), []);
  assert.equal(applyCollection(arrivals, 'all'), arrivals);
});
