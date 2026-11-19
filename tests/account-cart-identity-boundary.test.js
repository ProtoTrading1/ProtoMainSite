import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Execute the real handler with isolated auth/database ports; no credentials or network.
let current;
let writes;
const port = '__basketIdentityTest';
globalThis[port] = {
  approved: async () => ({ user: { id: 'synthetic-account' } }),
  client: () => ({ from() {
    let values;
    const query = {
      select() { return query; }, eq() { return query; },
      insert(value) { writes.push(value); values = value; return query; },
      update(value) { writes.push(value); values = value; return query; },
      async maybeSingle() { return { data: values || current, error: null }; },
      async single() { return { data: values, error: null }; },
    };
    return query;
  } }),
};
let source = await readFile(new URL('../api/account-cart.js', import.meta.url), 'utf8');
source = source.replace("import { createClient } from '@supabase/supabase-js';", `const createClient = globalThis.${port}.client;`)
  .replace("import { requireApprovedCustomer } from './_auth.js';", `const requireApprovedCustomer = globalThis.${port}.approved;`)
  .replace(/from '(\.\.[^']+)'/g, (_, path) => `from '${new URL(path, new URL('../api/account-cart.js', import.meta.url)).href}'`);
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const product = { id: 'LEAF', sku: 'LEAF', code: 'ERP', price: 12 };
const legacy = { product: { ...product, id: '[OBJECT OBJECT]', sku: '[OBJECT OBJECT]' }, qty: 2, preference: 'Existing' };
async function call(items, { existing = null, revision = existing?.revision || 0, mode = 'save', method = 'PUT' } = {}) {
  current = existing; writes = [];
  const response = { statusCode: 200, setHeader() {}, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await handler({ method, headers: { host: 'localhost' }, body: { mode, items, revision, activityAt: Date.now() } }, response);
  return response;
}

test('new object and literal-placeholder API saves fail before any database write', async () => {
  for (const mode of ['save', 'merge']) {
    for (const id of [{ sku: 'LEAF' }, '[OBJECT OBJECT]']) {
      const response = await call([{ product: { ...product, id }, qty: 1 }], { mode });
      assert.equal(response.statusCode, 400);
      assert.equal(writes.length, 0);
    }
  }
});

test('existing legacy basket reads, retains and reduces without guessing a replacement', async () => {
  const existing = { items: [legacy], revision: 3, activity_at: Date.now() };
  const read = await call([], { existing, method: 'GET' });
  assert.equal(read.statusCode, 200);
  assert.equal(read.body.items[0].product.id, '[OBJECT OBJECT]');
  for (const qty of [2, 1]) {
    const response = await call([{ ...legacy, qty }, { product, qty: 3 }], { existing });
    assert.equal(response.statusCode, 200);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].items[0].qty, qty);
  }
  for (const line of [{ ...legacy, qty: 3 }, { ...legacy, preference: 'Guessed' }]) {
    assert.equal((await call([line], { existing })).statusCode, 400);
    assert.equal(writes.length, 0);
  }
});

test('valid variants/preferences save; conflict and ignored merge contracts remain intact', async () => {
  const items = [{ product, qty: 1, preference: 'Red' }, { product, qty: 2, preference: 'Blue' }, { product: { ...product, id: 'OTHER', sku: 'OTHER' }, qty: 3 }];
  assert.equal((await call(items)).statusCode, 200);
  assert.equal(writes[0].items.length, 3);
  const existing = { items, revision: 5, activity_at: Date.now() };
  assert.equal((await call([legacy], { existing, revision: 4 })).statusCode, 409);
  assert.equal(writes.length, 0);
  assert.equal((await call([legacy], { existing, mode: 'merge' })).statusCode, 200);
  assert.equal(writes.length, 0);
});
