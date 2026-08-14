import assert from 'node:assert/strict';
import test from 'node:test';
import { detectCartPriceChanges } from '../src/lib/cartPriceChanges.js';

const item = (id, price, qty = 1) => ({ product: { id, name: `Product ${id}`, price }, qty });

test('reports increased and decreased saved basket prices', () => {
  const changes = detectCartPriceChanges(
    [item('A', 10, 2), item('B', 20), item('C', 30)],
    [item('A', 12, 2), item('B', 18), item('C', 30)],
  );

  assert.deepEqual(changes.map(({ key, direction, difference }) => ({ key, direction, difference })), [
    { key: 'A', direction: 'increased', difference: 4 },
    { key: 'B', direction: 'decreased', difference: -2 },
  ]);
});

test('ignores unchanged, missing and invalid catalogue prices', () => {
  assert.deepEqual(detectCartPriceChanges(
    [item('A', 10), item('B', 20), item('C', 'unknown')],
    [item('A', 10), item('C', 25)],
  ), []);
});
