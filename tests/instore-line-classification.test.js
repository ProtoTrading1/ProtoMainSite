import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUnflaggedInstoreSkus, resolveAuthoritativePrices } from '../api/send-order.js';

function fakeClient({ main = [], instore = [] }) {
  return {
    from(table) {
      return {
        select() { return this; },
        in(column, values) {
          const rows = table === 'website_stock' ? main : instore;
          return Promise.resolve({ data: rows.filter((row) => values.includes(String(row[column] ?? ''))), error: null });
        },
      };
    },
  };
}

test('an Instore SKU restored without its flag is classified as Instore', async () => {
  const items = [
    { qty: 1, product: { id: '8003-LTBLU', sku: '8003-LTBLU', code: '86140008003' } },
    { qty: 2, product: { id: '8610800961', sku: '8610800961', code: '8610800961' } },
  ];
  const client = fakeClient({ main: [{ sku: '8003-LTBLU', barcode: '86140008003' }], instore: [{ sku: '8610800961' }] });
  assert.deepEqual([...await detectUnflaggedInstoreSkus(items, client)], ['8610800961']);
});

test('a SKU that is also in the main catalogue stays a main-catalogue line', async () => {
  const items = [{ qty: 1, product: { id: 'X1', sku: 'X1', code: '123' } }];
  const client = fakeClient({ main: [{ sku: 'OTHER', barcode: '123' }], instore: [{ sku: 'X1' }] });
  assert.equal((await detectUnflaggedInstoreSkus(items, client)).size, 0);
});

test('a classification lookup failure falls back to the browser flag', async () => {
  const broken = { from() { throw new Error('offline'); } };
  assert.equal((await detectUnflaggedInstoreSkus([{ qty: 1, product: { sku: 'A' } }], broken)).size, 0);
});

test('reclassified lines are routed to the Instore resolver, not the main catalogue', async () => {
  await assert.rejects(
    () => resolveAuthoritativePrices([{ qty: 2, product: { id: '8610800961', sku: '8610800961' } }], { classify: async () => new Set(['8610800961']) }),
    /Instore/,
  );
});
