import { expect, test } from '@playwright/test';
import { parseCartMutation } from '../api/account-cart.js';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue } from './helpers/accessibility-services.js';

const product = catalogueProducts[0];
const pendingKey = `proto_cart_pending_${ACCOUNT_ID}`;

async function setup(context, writeFailure = null) {
  const safety = await installAccessibilityServices(context, { cartItems: [{ product, qty: 4 }] });
  // No development HMR may replay held synthetic intent during this probe.
  await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await context.addInitScript(mode => {
    window.__journalWriteFailure = mode;
    window.__journalRemoveFailure = null;
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('proto_cart_pending_') && window.__journalWriteFailure) {
        if (window.__journalWriteFailure === 'throw') throw new DOMException('Synthetic quota', 'QuotaExceededError');
        return undefined;
      }
      return originalSet.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (key.startsWith('proto_cart_pending_') && window.__journalRemoveFailure) {
        if (window.__journalRemoveFailure === 'throw') throw new DOMException('Synthetic denial', 'SecurityError');
        return undefined;
      }
      return originalRemove.call(this, key);
    };
  }, writeFailure);
  let server = { items: [{ product, qty: 4 }], activityAt: Date.now() - 10000, revision: 3 };
  const mutations = [];
  await context.route('**/api/account-cart', async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== LOCAL_ORIGIN) return route.abort();
    const method = request.method();
    if (method !== 'GET') {
      const body = request.postDataJSON();
      const mutation = parseCartMutation(body, { method });
      if (mutation.mode !== 'merge') {
        mutations.push({ method, body });
        if (mutation.revision !== server.revision) return route.fulfill({ status: 409,
          json: { error: 'A newer account basket is available', ...server } });
        server = { items: mutation.items, activityAt: mutation.activityAt, revision: server.revision + 1 };
      }
    }
    return route.fulfill({ json: server });
  });
  return { safety, mutations, snapshot: () => server };
}

async function openBasket(page) {
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  return page.locator('.order-drawer').filter({ visible: true }).first();
}

for (const mode of ['throw', 'silent']) {
  test(`pending journal ${mode} write failure prevents destructive clear and reload loss`, async ({ page, context }) => {
    const fixture = await setup(context, mode);
    await signInCatalogue(page);
    let drawer = await openBasket(page);
    await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Clear order', exact: true }).dispatchEvent('click');
    const quantity = () => drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true });
    await expect(quantity()).toHaveValue('4');
    await expect(drawer.getByRole('alert')).toContainText('could not keep pending basket changes');
    await expect(drawer.getByRole('alert')).toContainText('Support code: cart_device_storage');
    await page.waitForTimeout(700);
    expect(fixture.mutations).toEqual([]);
    expect(fixture.snapshot().items[0].qty).toBe(4);
    expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).toBeNull();
    await page.reload();
    await expect(page.locator('.product-card').first()).toBeVisible();
    drawer = await openBasket(page);
    await expect(quantity()).toHaveValue('4');
    expect(fixture.mutations).toEqual([]);
    // Repeat the denied operation, then recover storage and retry explicitly.
    await drawer.getByRole('button', { name: 'Clear order', exact: true }).dispatchEvent('click');
    await expect(drawer.getByRole('alert')).toContainText('could not keep pending basket changes');
    await page.evaluate(() => { window.__journalWriteFailure = null; });
    await drawer.getByRole('button', { name: 'Retry sync', exact: true }).click();
    await expect(drawer.getByRole('alert')).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Clear order', exact: true }).dispatchEvent('click');
    await expect.poll(() => fixture.mutations.length).toBe(1);
    expect(fixture.mutations[0].method).toBe('DELETE');
    expect(fixture.mutations[0].body.revision).toBe(3);
    await expect(drawer.getByText('Your basket is empty', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('alert')).toHaveCount(0);
    expect(fixture.snapshot().items).toEqual([]);
    expect(fixture.snapshot().revision).toBe(4);
    await expect.poll(() => page.evaluate(key => localStorage.getItem(key), pendingKey)).toBeNull();
    expect(fixture.safety.blockedRequests).toEqual([]);
  });
}

for (const mode of ['throw', 'silent']) {
  test(`acknowledged save with ${mode} journal removal failure warns until cleanup retry`, async ({ page, context }) => {
    const fixture = await setup(context);
    await signInCatalogue(page);
    const drawer = await openBasket(page);
    await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
    await page.evaluate(value => { window.__journalRemoveFailure = value; }, mode);
    await drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true }).fill('7');
    await drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true }).blur();
    await expect.poll(() => fixture.snapshot().items[0].qty).toBe(7);
    await expect(drawer.getByRole('alert')).toContainText('could not remove its older pending copy');
    await expect(drawer.getByText('Saved to account', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).not.toBeNull();
    expect(fixture.mutations).toHaveLength(1);
    await page.evaluate(() => { window.__journalRemoveFailure = null; });
    await drawer.getByRole('button', { name: 'Retry sync', exact: true }).click();
    await expect(drawer.getByRole('alert')).toHaveCount(0);
    await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
    expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).toBeNull();
    expect(fixture.snapshot().items[0].qty).toBe(7);
    expect(fixture.snapshot().revision).toBe(4);
    expect(fixture.mutations).toHaveLength(1);
    expect(fixture.safety.blockedRequests).toEqual([]);
  });
}
