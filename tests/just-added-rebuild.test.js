import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCollection } from '../src/lib/collectionFilter.js';

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
