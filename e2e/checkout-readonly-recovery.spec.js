import { expect, test } from '@playwright/test';
import { basketLineKey } from '../lib/basket-lines.mjs';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const original = { product: catalogueProducts[0], qty: 20, preference: 'Blue' };
const newer = { product: catalogueProducts[1], qty: 21, preference: 'Pink' };
const key = `proto_pending_checkout_v1:${ACCOUNT_ID}`;
const pending = () => ({ version: 1, customerId: ACCOUNT_ID,
  payload: { clientRef: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deliveryMethod: 'In store pick up', customerNotes: 'Original notes', promoCode: null,
    items: [{ qty: 20, preference: 'Blue', product: { id: original.product.id, sku: original.product.sku, code: original.product.code, source: 'main', isExtendedRange: false, checkoutSnapshot: { unitPrice: 79.5, stockQty: 100 } } }] },
  items: [original], total: 1590, fingerprint: JSON.stringify([[basketLineKey(original), 20]]), options: { courierChoice: 'pickup', customerNotes: 'Original notes', promo: null } });

async function setup(page, context, response, { fresh = false } = {}) {
  await installAccessibilityServices(context, { cartItems: [fresh ? original : newer] });
  const calls = { sends: [], checks: [], basketWrites: [] };
  page.on('request', request => { if (calls.checks.length > 0 && new URL(request.url()).pathname === '/api/account-cart' && (request.method() === 'DELETE' || (request.method() === 'PUT' && request.postDataJSON()?.mode !== 'touch'))) calls.basketWrites.push({ method: request.method(), body: request.postDataJSON() }); });
  await context.route('**/api/send-order', route => { calls.sends.push(route.request().postDataJSON()); return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic lost response' }) }); });
  await context.route('**/api/checkout-recovery', async route => { calls.checks.push(route.request().postDataJSON()); return route.fulfill({ status: response.status ?? 200, contentType: 'application/json', body: JSON.stringify(response.body ?? response) }); });
  await signInCatalogue(page);
  if (!fresh) {
    await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), { key, record: pending() });
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Saved request needs confirmation' })).toBeVisible();
  }
  return calls;
}
async function assertNewerKept(page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(page.locator('.order-drawer').filter({ visible: true }).first().getByRole('spinbutton', { name: `Quantity for ${newer.product.code} (Pink)`, exact: true })).toHaveValue('21');
}

test('received check confirms only saved payload, keeps newer basket and renders desktop/mobile controls', async ({ page, context }, info) => {
  const calls = await setup(page, context, { state: 'received', success: true, orderId: 'synthetic-received', orderNumber: 'TEST-SAVED', deliveryUnchecked: true });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('1 product lines · R1590.00')).toBeVisible();
  await expect(dialog.getByText('1 product lines · R1669.50')).toBeVisible();
  await dialog.getByRole('button', { name: 'Check saved request' }).click();
  await expect(page.getByRole('heading', { name: 'Saved request received' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Saved request received' })).toBeInViewport({ ratio: 1 });
  await expect(page.getByText(/Email and WhatsApp delivery were not checked/)).toBeVisible();
  expect(calls.checks).toEqual([pending().payload]); expect(calls.sends).toEqual([]); expect(calls.basketWrites).toEqual([]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).status, key)).toBe('accepted');
  await page.setViewportSize(info.project.name.includes('mobile') ? { width: 393, height: 540 } : { width: 1280, height: 720 });
  await dialog.evaluate(node => { node.scrollTop = 0; });
  const bounds = await dialog.evaluate(node => {
    const box = node.getBoundingClientRect();
    const heading = node.querySelector('h2').getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, viewport: innerHeight, headingTop: heading.top, headingBottom: heading.bottom };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport);
  expect(bounds.headingTop).toBeGreaterThanOrEqual(bounds.top);
  expect(bounds.headingBottom).toBeLessThanOrEqual(bounds.bottom);
  await page.screenshot({ path: info.outputPath('received-header-viewport.png'), fullPage: true });
  for (const button of await dialog.getByRole('button').all()) {
    await button.scrollIntoViewIfNeeded();
    expect(await button.evaluate(node => {
      const box = node.getBoundingClientRect();
      const container = node.closest('[role="dialog"]').getBoundingClientRect();
      return box.top >= Math.max(0, container.top) && box.bottom <= Math.min(innerHeight, container.bottom);
    })).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().focus();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true }).last()).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('received-actions-viewport.png'), fullPage: true });
  await assertNewerKept(page);
});

for (const [name, response] of [['not found', { state: 'not_found', safeToStartNew: false, reconciliationRequired: true }], ['conflict', { status: 409, body: { error: 'Historical request needs reconciliation', code: 'ORDER_REFERENCE_CONFLICT' } }], ['malformed', {}]]) {
  test(`${name} holds exact reference and all basket bytes without sending`, async ({ page, context }, info) => {
    const calls = await setup(page, context, response);
    const before = await page.evaluate(key => localStorage.getItem(key), key);
    await page.getByRole('button', { name: 'Check saved request' }).click();
    await expect(page.getByRole('heading', { name: 'Saved request needs confirmation' })).toBeVisible();
    await expect.poll(() => calls.checks.length).toBe(1);
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(before);
    expect(calls.sends).toEqual([]); expect(calls.basketWrites).toEqual([]);
    if (name === 'not found') await page.screenshot({ path: info.outputPath('notfound-held.png'), fullPage: true });
    await assertNewerKept(page);
  });
}

test('first uncertain submit immediately exposes read-only check without reload or another send', async ({ page, context }) => {
  const calls = await setup(page, context, { state: 'not_found', safeToStartNew: false, reconciliationRequired: true }, { fresh: true });
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Review order request', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Continue to options', exact: true }).click();
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  await page.getByRole('button', { name: /Pick up in store/ }).click();
  await page.getByRole('button', { name: /^Send order request/ }).click();
  await expect(page.getByRole('button', { name: 'Check saved request' })).toBeVisible();
  expect(calls.sends).toHaveLength(1);
  const before = await page.evaluate(key => localStorage.getItem(key), key);
  await page.getByRole('button', { name: 'Check saved request' }).click();
  await expect(page.getByText(/No matching received order was found/)).toBeVisible();
  expect(calls.sends).toHaveLength(1); expect(calls.checks).toEqual([calls.sends[0]]);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(before);
});
