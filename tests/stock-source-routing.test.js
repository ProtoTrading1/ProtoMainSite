import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the actual handler and Instore bridge path with inert adapters.
// Every recorded read is local: no DB, customer, credentials or provider call.
const code = readFileSync(new URL('../api/stock.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace(/export default /g, '').replace(/export /g, '');

async function check(source, { mainRows = [], instoreRows = [{ sku: 'COLLISION' }], approved = true, authenticated = true, bridgeFailure = false } = {}) {
  const calls = [];
  const filters = [];
  const query = (rows, table) => ({ selected: rows, select() { return this; },
    eq(field, value) { filters.push({ table, field, value }); this.selected = rows.filter(row => row[field] === value); return this; },
    or() { filters.push({ table, field: 'legacy-or' }); return this; },
    async limit(count) { calls.push(table); return { data: this.selected.slice(0, count), error: null }; } });
  const context = { Date, Number, String, Math, AbortSignal,
    process: { env: { STOCK_SQL_BRIDGE_URL: 'https://synthetic.invalid', STOCK_SQL_BRIDGE_KEY: 'synthetic-test-only' } },
    console: { error() {} },
    requireAuth: async () => authenticated ? { id: 'synthetic-owner' } : null,
    getApprovedCustomer: async () => { calls.push('approval'); return approved ? {} : null; },
    createClient: () => ({ from: table => query(mainRows, table) }),
    stockClient: () => ({ from: table => query(instoreRows, table) }),
    buildExtendedRangeProducts: rows => rows,
    fetch: async () => { calls.push('stmast'); if (bridgeFailure) throw new Error('unavailable'); return {
      ok: true, json: async () => ({ row: { CODE: 'COLLISION', ONHAND: 30, BOOKED: 7 } }),
    }; },
    loadIncomingAvailability: async () => { calls.push('incoming'); return {}; },
    availabilityForRow: row => ({ state: row.to_order ? 'to_order' : 'in_stock', canOrder: true }),
  };
  runInNewContext(code + '\nglobalThis.handler = handler;', context);
  const res = { statusCode: null, payload: null, setHeader() {}, status(status) { this.statusCode = status; return this; },
    json(payload) { this.payload = payload; return this; } };
  const queryParams = { sku: 'COLLISION', ...(source === undefined ? {} : { source }) };
  await context.handler({ method: 'GET', query: queryParams }, res);
  return { res, calls, filters };
}

test('explicit Instore uses fresh canonical bridge stock despite a same-SKU Main projection', async () => {
  const { res, calls } = await check('instore', { mainRows: [{ stock_qty: 0, available_stock: 99, to_order: true }] });
  assert.equal(res.statusCode, 200); assert.equal(res.payload.qty, 23);
  assert.equal(res.payload.to_order, false); assert.equal(res.payload.availability.state, 'in_stock');
  assert.deepEqual(calls, ['approval', 'extended_range_items', 'stmast']);
});

test('explicit Main never adopts an Instore product when its Main projection is absent', async () => {
  const { res, calls } = await check('main');
  assert.equal(res.statusCode, 404); assert.equal(calls.includes('extended_range_items'), false);
  assert.equal(calls.includes('stmast'), false);
});

test('explicit Main preserves Stock Available precedence and genuine To Order response', async () => {
  const { res, calls } = await check('main', { mainRows: [{ sku: 'COLLISION', stock_qty: 0, available_stock: 12, to_order: true }] });
  assert.equal(res.statusCode, 200); assert.equal(res.payload.qty, 12);
  assert.equal(res.payload.to_order, true); assert.equal(res.payload.availability.state, 'to_order');
  assert.equal(calls.includes('stmast'), false);
});

test('explicit Main variant SKU rejects another variant barcode alias as its stock authority', async () => {
  const alias = { sku: 'OTHER-VARIANT', barcode: 'COLLISION', available_stock: 99, to_order: true };
  const exact = { sku: 'COLLISION', barcode: 'PHYSICAL-POOL', available_stock: 12, to_order: false };
  for (const mainRows of [[alias, exact], [exact, alias]]) {
    const { res, filters } = await check('main', { mainRows });
    assert.equal(res.statusCode, 200); assert.equal(res.payload.qty, 12);
    assert.equal(res.payload.to_order, false); assert.equal(res.payload.availability.state, 'in_stock');
    assert.deepEqual(filters, [{ table: 'website_stock', field: 'sku', value: 'COLLISION' }]);
  }
  const missing = await check('main', { mainRows: [alias] });
  assert.equal(missing.res.statusCode, 404, 'barcode alias alone cannot adopt a Main variant');
});

test('missing source retains legacy Main-first and Instore fallback compatibility', async () => {
  const main = await check(undefined, { mainRows: [{ sku: 'COLLISION', available_stock: 11 }] });
  assert.equal(main.res.payload.qty, 11); assert.equal(main.calls.includes('stmast'), false);
  const instore = await check(undefined);
  assert.equal(instore.res.payload.qty, 23); assert.equal(instore.calls.includes('stmast'), true);
});

test('malformed source is rejected before auth, catalogue or bridge access', async () => {
  for (const source of ['', 'INSTORE', ['instore'], {}, null, 'unknown']) {
    const { res, calls } = await check(source);
    assert.equal(res.statusCode, 400); assert.deepEqual(calls, []);
  }
});

test('explicit Instore failures never fall through to Main and preserve auth/approval gates', async () => {
  const failed = await check('instore', { bridgeFailure: true });
  assert.equal(failed.res.statusCode, 502); assert.equal(failed.calls.includes('website_stock'), false);
  const missing = await check('instore', { instoreRows: [] });
  assert.equal(missing.res.statusCode, 404); assert.equal(missing.calls.includes('stmast'), false);
  const denied = await check('instore', { approved: false });
  assert.deepEqual(denied.calls, ['approval']);
  const anonymous = await check('instore', { authenticated: false });
  assert.deepEqual(anonymous.calls, []);
});
