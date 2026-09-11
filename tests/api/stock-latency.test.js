import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateInstoreBridgeStock } from '../../api/stock.js';

test('Instore stock requires its exact product identity and complete numeric balances', () => {
  const sku = '8618100133';
  const row = { CODE: sku, ONHAND: '12', BOOKED: '1' };
  assert.equal(validateInstoreBridgeStock(sku, row).qty, 11);
  assert.throws(() => validateInstoreBridgeStock(sku, { ...row, CODE: '8618100134' }), /different product/);
  assert.throws(() => validateInstoreBridgeStock(sku, { ...row, CODE: null }), /different product/);
  for (const field of ['ONHAND', 'BOOKED']) {
    for (const value of [null, undefined, '', ' ', 'invalid', NaN, Infinity, false]) {
      assert.throws(() => validateInstoreBridgeStock(sku, { ...row, [field]: value }), /incomplete stock/);
    }
  }
  assert.throws(() => validateInstoreBridgeStock(sku, { ...row, BOOKED: -1 }), /invalid booked/);
  assert.equal(validateInstoreBridgeStock(sku, { ...row, ONHAND: 0, BOOKED: 0 }).availability.canOrder, false);
});

const readSource = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('live stock keeps authentication first and overlaps approval with the stock read', async () => {
  const source = await readSource('api/stock.js');

  const authIndex = source.indexOf('await requireAuth(req, res)');
  const parallelIndex = source.indexOf('await Promise.all([');
  // The isolated Instore preview has its own approval/read path before the
  // normal catalogue flow. Assert the normal flow specifically, rather than
  // treating the first preview reference as the live-stock implementation.
  const approvalIndex = source.lastIndexOf('getApprovedCustomer(user, res)');
  const stockIndex = source.lastIndexOf(".from('website_stock')");

  assert.ok(authIndex >= 0, 'the caller is authenticated');
  assert.ok(parallelIndex > authIndex, 'parallel reads only start after authentication');
  assert.ok(approvalIndex > parallelIndex, 'approval remains mandatory');
  assert.ok(stockIndex > parallelIndex, 'the live stock read shares the parallel stage');
  assert.match(source, /if \(!access\) return;/);
  assert.match(source, /cache-control/i);
});

test('shared approved-customer checks retain the trade-account gate', async () => {
  const source = await readSource('api/_auth.js');

  assert.match(source, /export async function getApprovedCustomer\(user, res\)/);
  assert.match(source, /customer\.role !== 'admin' && customer\.is_approved !== true/);
  assert.match(source, /return getApprovedCustomer\(user, res\)/);
});

test('live stock cannot remain stuck behind session or request work', async () => {
  const [headers, card, root, products] = await Promise.all([
    readSource('src/lib/authHeaders.js'),
    readSource('src/components/ProductCard.jsx'),
    readSource('src/Root.jsx'),
    readSource('src/lib/products.js'),
  ]);

  assert.match(headers, /AUTH_SESSION_TIMEOUT_MS\s*=\s*4000/);
  assert.match(headers, /export function rememberAuthSession\(session\)/);
  assert.match(headers, /export function authenticatedGetJson/);
  assert.match(headers, /response\.status === 401/);
  assert.match(card, /authenticatedGetJson\(`\/api\/stock\?sku=/);
  assert.match(card, /timeoutMs:\s*10000/);
  assert.match(card, /requestRef\.current\?\.abort\(\)/);
  assert.match(card, /Choose option/);
  assert.doesNotMatch(card, /Select option for live stock|View options/);
  assert.match(root, /rememberAuthSession\(sess\)/);
  assert.match(products, /authenticatedGetJson\(url, \{ cache, timeoutMs \}\)/);
});
