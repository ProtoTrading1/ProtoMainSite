import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { mergeBasketLines } from '../lib/basket-lines.mjs';
import { knownCartProductSource, recoverCartProducts } from '../src/lib/cartProductRecovery.mjs';

const source = readFileSync(new URL('../src/lib/extendedRange.js', import.meta.url), 'utf8');
const body = source.match(/export async function fetchInstoreProductsBySkus[\s\S]*?\r?\n}/)[0].replace('export ', '');
function lookup(rows) {
  const calls = [];
  const run = runInNewContext(`(${body})`, { fetchExtendedRange: async (...args) => { calls.push(args); return { catalogue: rows }; } });
  return { run, calls };
}
test('Instore lookup uses a fresh verified collection and exact SKU, never a barcode/name collision', async () => {
  const exact = { id: 'POS-1', sku: 'POS-1', code: 'OTHER', price: 115, isExtendedRange: true };
  const f = lookup([exact, { id: 'OTHER', sku: 'OTHER', code: 'MISSING', name: 'MISSING' }]);
  const signal = new AbortController().signal;
  const result = await f.run(['pos-1', 'MISSING'], { signal });
  assert.equal(result.get('POS-1'), exact);
  assert.equal(result.has('MISSING'), false);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], '');
  assert.equal(f.calls[0][1].signal, signal);
  assert.equal(f.calls[0][1].fresh, true);
  assert.equal(f.calls[0][1].includeCatalogue, true);
});
test('duplicate Instore SKU evidence is held rather than taking the first price', async () => {
  const f = lookup([{ sku: 'DUP', price: 10 }, { sku: 'DUP', price: 99 }, { sku: 'KEPT', price: 20 }]);
  const result = await f.run(['DUP', 'KEPT']);
  assert.equal(result.has('DUP'), false);
  assert.equal(result.get('KEPT').price, 20);
});
test('an empty Instore request does not download a catalogue', async () => {
  const f = lookup([]); assert.equal((await f.run([])).size, 0); assert.equal(f.calls.length, 0);
});
test('an incomplete Instore response fails rather than falling back to Main', async () => {
  const run = runInNewContext(`(${body})`, { fetchExtendedRange: async () => ({ products: [{ sku: 'POS-1', price: 99 }] }) });
  await assert.rejects(run(['POS-1']), /could not be confirmed/);
});
test('actual App hydration keeps source-specific prices and every quantity through a same-SKU collision', async () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const hydrateBody = app.match(/async function hydrateAccountCartItems[\s\S]*?\r?\n}/)[0];
  const main = { id: 'COLLISION', sku: 'COLLISION', source: 'main', isExtendedRange: false, price: 100, stockQty: 50, toOrder: true };
  const instore = { id: 'COLLISION', sku: 'COLLISION', source: 'instore', isExtendedRange: true, price: 115, stockQty: 40 };
  const requests = [];
  const hydrate = runInNewContext(`(${hydrateBody})`, { mergeBasketLines, recoverCartProducts, knownCartProductSource,
    fetchProductsBySkus: async keys => { requests.push(['main', ...keys]); return new Map([['COLLISION', main]]); },
    fetchInstoreProductsBySkus: async keys => { requests.push(['instore', ...keys]); return new Map([['COLLISION', instore]]); } });
  const unknown = { product: { id: 'HISTORICAL', price: 30 }, qty: 6 };
  const result = await hydrate([{ product: { ...main, price: 90 }, qty: 4, preference: 'Main selection' },
    { product: { ...instore, price: 90 }, qty: 7, preference: 'Instore selection' }, unknown]);
  assert.deepEqual(requests.map(row => Array.from(row)), [['main', 'COLLISION'], ['instore', 'COLLISION']]);
  assert.deepEqual(result.map(line => [line.product.source, line.product.price, line.qty]), [['main', 100, 4], ['instore', 115, 7], [undefined, 30, 6]]);
  assert.equal(result[0].product.toOrder, true);
  assert.equal(result[2].accountProductNeedsReview, true);
  assert.deepEqual(unknown, { product: { id: 'HISTORICAL', price: 30 }, qty: 6 });
});
