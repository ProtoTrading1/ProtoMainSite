import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('live stock keeps authentication first and overlaps approval with the stock read', async () => {
  const source = await readSource('api/stock.js');

  const authIndex = source.indexOf('await requireAuth(req, res)');
  const parallelIndex = source.indexOf('await Promise.all([');
  const approvalIndex = source.indexOf('getApprovedCustomer(user, res)');
  const stockIndex = source.indexOf(".from('website_stock')");

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
