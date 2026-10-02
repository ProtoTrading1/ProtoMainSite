import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue } from './helpers/accessibility-services.js';

const products = catalogueProducts.slice(0, 2).map((product) => ({ ...product, price: 250 }));
const items = products.map((product, index) => ({ product, qty: index === 0 ? 15 : 4 }));
const quantities = items.map(({ product, qty }) => ({ id: product.id, qty }));

for (const status of [400, 401, 403, 413, 422]) {
  test(`save rejection ${status} keeps the draft and stops background retries`, async ({ page, context }) => {
    let recovering = false;
    const { drawer, requests, safety } = await openSyntheticBasket(page, context, async (route) => {
      const body = route.request().postDataJSON();
      if (body?.mode !== 'save') return recovered(route);
      return route.fulfill({ status: recovering ? 200 : status, contentType: 'application/json',
        body: JSON.stringify(recovering
          ? { items: body.items, activityAt: body.activityAt, revision: 3 }
          : { error: 'Synthetic rejected save' }) });
    });
    await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
    const input = drawer.getByRole('spinbutton', { name: `Quantity for ${products[0].code}`, exact: true });
    await input.fill('16');
    await input.blur();
    await expect(drawer.getByRole('button', { name: 'Retry account basket sync', exact: true })).toBeVisible();
    await expect(input).toHaveValue('16');
    const saves = () => requests.filter((request) => request.body?.mode === 'save');
    // One 401 token refresh is intentional and bounded inside a single request.
    const failedAttempts = status === 401 ? 2 : 1;
    expect(saves()).toHaveLength(failedAttempts);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(1800);
    expect(saves()).toHaveLength(failedAttempts);
    const draft = await page.evaluate((id) => JSON.parse(localStorage.getItem(`proto_cart_pending_${id}`)), ACCOUNT_ID);
    expect(draft.items[0].qty).toBe(16);
    expect(draft.baseRevision).toBe(2);
    recovering = true;
    await drawer.getByRole('button', { name: 'Retry account basket sync', exact: true }).click();
    await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
    expect(saves()).toHaveLength(failedAttempts + 1);
    await expect(input).toHaveValue('16');
    expect(safety.blockedRequests).toEqual([]);
  });
}

function gate() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { promise, release };
}

async function openSyntheticBasket(page, context, respond) {
  const safety = await installAccessibilityServices(context, { products, cartItems: items });
  const requests = [];
  await context.route('**/api/account-cart', async (route) => {
    // This override must retain the shared fixture's local-only boundary.
    if (new URL(route.request().url()).origin !== LOCAL_ORIGIN) return route.abort();
    requests.push({ method: route.request().method(), body: route.request().postDataJSON() });
    await respond(route, requests.length);
  });
  await context.addInitScript(({ items }) => {
    localStorage.setItem('proto_cart', JSON.stringify(items));
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now() - 60000));
  }, { items });
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer).toBeVisible();
  // Vite's React StrictMode may replay the initial authenticated mount.
  // Count retry imports relative to that startup baseline, not the mount count.
  await expect.poll(() => requests.length).toBeGreaterThanOrEqual(1);
  return { drawer, requests, safety };
}

async function unavailable(route) {
  await route.fulfill({ status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: 'Synthetic basket service unavailable' }) });
}

async function recovered(route) {
  await route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ items, activityAt: Date.now(), revision: 2 }) });
}

async function expectItemsPreserved(page, drawer) {
  await expect(drawer.locator('[data-cart-product-id]')).toHaveCount(items.length);
  for (const { product, qty } of items) {
    const line = drawer.locator(`[data-cart-product-id="${product.id}"]`);
    await expect(line.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
    await expect(line.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true })).toHaveValue(String(qty));
  }
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart') || '[]')
    .map(({ product, qty }) => ({ id: product.id, qty })))).toEqual(quantities);
}

async function expectRecoverableFailure(page, drawer, timeout = 5000) {
  await expect(drawer.getByText('Basket sync needs attention', { exact: true })).toBeVisible({ timeout });
  await expect(drawer.getByRole('button', { name: 'Retry account basket sync', exact: true })).toBeEnabled();
  await expect(drawer.getByRole('button', { name: 'Loading account basket…', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
  await expectItemsPreserved(page, drawer);
}

async function expectRecovered(page, drawer, requests, safety, failedAttempts) {
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toBeEnabled();
  await expect(drawer.getByText('Basket sync needs attention', { exact: true })).toHaveCount(0);
  await expectItemsPreserved(page, drawer);
  expect(requests).toHaveLength(failedAttempts + 1);
  for (const request of requests) {
    expect(request.method).toBe('PUT');
    expect(request.body.mode).toBe('merge');
    expect(request.body.items).toEqual(items);
  }
  // No checkout click or order submission; unexpected APIs fail closed.
  expect(safety.blockedRequests).toEqual([]);
}

test('503 account import allows manual recovery without losing basket lines', async ({ page, context }) => {
  const initial = gate();
  let recovering = false;
  try {
    const { drawer, requests, safety } = await openSyntheticBasket(page, context, async (route) => {
      if (!recovering) {
        await initial.promise;
        return unavailable(route);
      }
      return recovered(route);
    });
    initial.release();
    await expectRecoverableFailure(page, drawer);
    const failedAttempts = requests.length;
    recovering = true;
    await drawer.getByRole('button', { name: 'Retry account basket sync', exact: true }).click();
    await expectRecovered(page, drawer, requests, safety, failedAttempts);
    // A manual retry cancels the pending 3-second outage backoff.
    await page.waitForTimeout(3500);
    expect(requests).toHaveLength(failedAttempts + 1);
  } finally {
    initial.release();
  }
});

test('never-returning local import times out and can be retried with the same items', async ({ page, context }) => {
  test.setTimeout(45000);
  const stalled = gate();
  let recovering = false;
  let startedAt;
  try {
    const { drawer, requests, safety } = await openSyntheticBasket(page, context, async (route) => {
      if (!recovering) {
        startedAt ??= Date.now();
        // No response/abort until cleanup: exercise the real 15-second bound.
        await stalled.promise;
        return route.abort();
      }
      return recovered(route);
    });
    await expect(drawer.getByRole('button', { name: 'Loading account basket…', exact: true })).toBeDisabled();
    await expectItemsPreserved(page, drawer);
    await expectRecoverableFailure(page, drawer, 18000);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(14000);
    expect(Date.now() - startedAt).toBeLessThan(19000);
    const failedAttempts = requests.length;
    recovering = true;
    await drawer.getByRole('button', { name: 'Retry account basket sync', exact: true }).click();
    await expectRecovered(page, drawer, requests, safety, failedAttempts);
    await page.waitForTimeout(3500);
    expect(requests).toHaveLength(failedAttempts + 1);
  } finally {
    stalled.release();
  }
});

test('rapid retry clicks keep only one account import in flight', async ({ page, context }) => {
  const initial = gate();
  const retryResponse = gate();
  let recovering = false;
  try {
    const { drawer, requests, safety } = await openSyntheticBasket(page, context, async (route) => {
      if (!recovering) {
        await initial.promise;
        return unavailable(route);
      }
      await retryResponse.promise;
      return recovered(route);
    });
    initial.release();
    await expectRecoverableFailure(page, drawer);
    const failedAttempts = requests.length;
    recovering = true;
    // Deliver rapid user-control events before React replaces the retry buttons.
    // Both visible entry points share the in-flight guard; no app internals used.
    await drawer.evaluate((element) => {
      const buttons = [...element.querySelectorAll('button')]
        .filter((button) => ['Retry sync', 'Retry account basket sync'].includes(button.textContent.trim()));
      if (buttons.length !== 2) throw new Error('Expected both visible retry controls');
      for (let index = 0; index < 5; index += 1) buttons.forEach((button) => button.click());
    });
    await expect.poll(() => requests.length).toBe(failedAttempts + 1);
    await expect(drawer.getByRole('button', { name: 'Loading account basket…', exact: true })).toBeDisabled();
    await expect(drawer.getByRole('button', { name: 'Retry account basket sync', exact: true })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
    await expectItemsPreserved(page, drawer);
    // Keep the retry pending past the old backoff deadline to expose races.
    await page.waitForTimeout(3500);
    expect(requests).toHaveLength(failedAttempts + 1);
    retryResponse.release();
    await expectRecovered(page, drawer, requests, safety, failedAttempts);
  } finally {
    initial.release();
    retryResponse.release();
  }
});
