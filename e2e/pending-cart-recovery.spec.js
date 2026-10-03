import { expect, test } from '@playwright/test';
import { parseCartMutation } from '../api/account-cart.js';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const recoveryKey = `proto_cart_recovery:${ACCOUNT_ID}:foreign-synthetic-copy`;
const otherKey = 'proto_cart_recovery:another-account:protected';

async function setup(context, malformed = false) {
  const product = catalogueProducts[0];
  const safety = await installAccessibilityServices(context);
  await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
  const draft = { accountId: ACCOUNT_ID, items: [{ product, qty: 24, preference: 'Blue' }], type: 'save', intent: 'normal', activityAt: Date.now() - 10000, baseRevision: 1 };
  const raw = malformed ? '{unreadable' : JSON.stringify(draft);
  await context.addInitScript(({ key, raw, other }) => {
    localStorage.setItem(key, raw);
    localStorage.setItem(other, 'protected-other-account');
  }, { key: recoveryKey, raw, other: otherKey });
  let cart = { items: [{ product, qty: 20 }], activityAt: Date.now(), revision: 1 };
  const writes = [];
  await context.route('**/api/account-cart', route => {
    const request = route.request();
    if (request.method() !== 'GET') {
      const mutation = parseCartMutation(request.postDataJSON(), { method: request.method() });
      if (mutation.mode !== 'merge') {
        writes.push(mutation);
        if (mutation.revision !== cart.revision) return route.fulfill({ status: 409, json: { ...cart, error: 'Synthetic revision conflict' } });
        cart = { items: mutation.items, activityAt: mutation.activityAt, revision: cart.revision + 1 };
      }
    }
    return route.fulfill({ json: cart });
  });
  return { safety, raw, writes, snapshot: () => cart };
}

async function openBasket(page) {
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  return page.locator('.order-drawer').filter({ visible: true }).first();
}

test('foreign pending copy is reviewed and explicitly restored with real revision acknowledgement', async ({ page, context }) => {
  const fixture = await setup(context);
  const drawer = await openBasket(page);
  await expect(drawer.getByText('Pending basket copies need review', { exact: true })).toBeVisible();
  await expect(drawer.getByText(/: 24 \(Blue\)/)).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Pending copies need review', exact: true })).toBeDisabled();
  expect(fixture.writes).toEqual([]);
  await drawer.getByRole('button', { name: 'Restore this copy', exact: true }).click();
  await expect.poll(() => fixture.snapshot().items[0].qty).toBe(24);
  await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${catalogueProducts[0].code}`, exact: true })).toHaveValue('24');
  await expect(drawer.getByText('Pending basket copies need review', { exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toBeEnabled();
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].revision).toBe(1);
  expect(fixture.snapshot().revision).toBe(2);
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), otherKey)).toBe('protected-other-account');
  expect(fixture.safety.blockedRequests).toEqual([]);
});

test('keeping account basket discards only explicitly reviewed copy without account writes', async ({ page, context }) => {
  const fixture = await setup(context);
  const drawer = await openBasket(page);
  await drawer.getByRole('button', { name: 'Keep account basket', exact: true }).click();
  await expect(drawer.getByText('Pending basket copies need review', { exact: true })).toHaveCount(0);
  expect(fixture.snapshot().items[0].qty).toBe(20);
  expect(fixture.writes).toEqual([]);
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), otherKey)).toBe('protected-other-account');
  expect(fixture.safety.blockedRequests).toEqual([]);
});

test('unreadable immutable evidence remains protected and blocks review', async ({ page, context }) => {
  const fixture = await setup(context, true);
  const drawer = await openBasket(page);
  await expect(drawer.getByText('A pending copy could not be read. It has been kept; contact Proto before ordering.', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Pending copies need review', exact: true })).toBeDisabled();
  await expect(drawer.getByRole('button', { name: 'Keep account basket', exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), recoveryKey)).toBe(fixture.raw);
  expect(fixture.writes).toEqual([]);
  expect(fixture.safety.blockedRequests).toEqual([]);
});
