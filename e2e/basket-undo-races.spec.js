import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue } from './helpers/accessibility-services.js';

const product = { ...catalogueProducts[0], price: 250 };
const items = [{ product, qty: 15 }];
const pendingKey = `proto_cart_pending_${ACCOUNT_ID}`;

async function storedDraft(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), pendingKey);
}

async function expectLocalQuantity(page, drawer, qty) {
  await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true })).toHaveValue(String(qty));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart') || '[]')
    .map(({ product, qty }) => ({ id: product.id, qty })))).toEqual([{ id: product.id, qty }]);
}

async function openBasket(page, context, { restoreResponse } = {}) {
  const safety = await installAccessibilityServices(context, { products: [product], cartItems: items });
  // Freeze each loaded page's code: concurrent main edits must not replay
  // hydration through Vite HMR while a synthetic request is held in flight.
  // WebSockets are never connected to a real service either.
  await context.routeWebSocket('**/*', (socket) => socket.send(JSON.stringify({ type: 'connected' })));
  const mutations = [];
  let server = { items, activityAt: Date.now() - 60000, revision: 1 };
  await context.route('**/api/account-cart', async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin !== LOCAL_ORIGIN) return route.abort();
    const body = request.method() === 'GET' ? null : request.postDataJSON();
    if (request.method() === 'DELETE' || body?.mode === 'save') {
      mutations.push({ method: request.method(), body });
      if (body?.mode === 'save' && restoreResponse) return restoreResponse(route, body);
      server = { items: request.method() === 'DELETE' ? [] : body.items,
        activityAt: body.activityAt, revision: server.revision + 1 };
    }
    // Initial imports/reads return only this fixture's synthetic account copy.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(server) });
  });
  await context.addInitScript(({ items }) => {
    localStorage.setItem('proto_cart', JSON.stringify(items));
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now() - 60000));
    sessionStorage.setItem('proto_welcome_dismissed', '1');
  }, { items });
  await page.clock.install();
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  const reminder = page.locator('.customer-journey-prompt--basket');
  if (await reminder.isVisible()) {
    await reminder.getByRole('button', { name: 'Close basket reminder and continue shopping' }).click();
  }
  await expectLocalQuantity(page, drawer, 15);
  // Complete drawer animation before pausing timers for debounce assertions.
  await page.waitForTimeout(600);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  expect(mutations).toEqual([]);
  expect(await storedDraft(page)).toBeNull();
  return { drawer, mutations, safety, setRemote: (snapshot) => { server = snapshot; } };
}

test('clear then Undo before debounce sends no DELETE and removes the pending journal', async ({ page, context }) => {
  const { drawer, mutations, safety } = await openBasket(page, context);
  await drawer.getByRole('button', { name: 'Clear order', exact: true }).dispatchEvent('click');
  await page.clock.runFor(100);
  await expect(drawer.getByText('Your basket is empty', { exact: true })).toBeVisible();
  await expect.poll(async () => (await storedDraft(page))?.type).toBe('clear');
  expect(mutations).toEqual([]);
  await drawer.getByRole('button', { name: 'Undo', exact: true }).dispatchEvent('click');
  await page.clock.runFor(100);
  await expectLocalQuantity(page, drawer, 15);
  await expect.poll(() => storedDraft(page)).toBeNull();
  // Pass the original and replacement debounce deadlines, not just one frame.
  await page.clock.runFor(1500);
  expect(mutations).toEqual([]);
  expect(await storedDraft(page)).toBeNull();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  expect(safety.blockedRequests).toEqual([]);
});

test('newer remote refresh invalidates Undo instead of restoring the old cleared basket', async ({ page, context }) => {
  const { drawer, mutations, safety, setRemote } = await openBasket(page, context);
  await drawer.getByRole('button', { name: 'Clear order', exact: true }).dispatchEvent('click');
  await page.clock.runFor(500);
  await expect.poll(() => mutations.length).toBe(1);
  await expect.poll(() => storedDraft(page)).toBeNull();
  await expect(drawer.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
  const remoteProduct = catalogueProducts[1];
  setRemote({ items: [{ product: remoteProduct, qty: 3 }], activityAt: Date.now(), revision: 3 });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${remoteProduct.code}`, exact: true })).toHaveValue('3');
  await expect(drawer.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
  await expect(drawer.locator(`[data-cart-product-id="${product.id}"]`)).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart') || '[]')
    .map(({ product, qty }) => ({ id: product.id, qty })))).toEqual([{ id: remoteProduct.id, qty: 3 }]);
  await page.clock.runFor(1500);
  expect(mutations).toHaveLength(1);
  expect(mutations[0].method).toBe('DELETE');
  expect(await storedDraft(page)).toBeNull();
  expect(safety.blockedRequests).toEqual([]);
});

test('confirmed predecessor save advances the queued edit journal base revision', async ({ page, context }) => {
  let releaseFirst;
  let releaseSecond;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const secondGate = new Promise((resolve) => { releaseSecond = resolve; });
  let saves = 0;
  try {
    const { drawer, mutations, safety } = await openBasket(page, context, {
      restoreResponse: async (route, body) => {
        const save = ++saves;
        await (save === 1 ? firstGate : secondGate);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          items: body.items, activityAt: body.activityAt, revision: save + 1,
        }) });
      },
    });
    const increase = drawer.getByRole('button', { name: `Increase quantity for ${product.name}`, exact: true });
    await increase.dispatchEvent('click');
    await page.clock.runFor(500);
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0].body.revision).toBe(1);
    expect(mutations[0].body.items[0].qty).toBe(16);
    await increase.dispatchEvent('click');
    await page.clock.runFor(100);
    await expectLocalQuantity(page, drawer, 17);
    await expect.poll(async () => (await storedDraft(page))?.items[0].qty).toBe(17);
    expect((await storedDraft(page)).baseRevision).toBe(1);
    releaseFirst();
    // The acknowledged predecessor updates the journal before its immediate
    // queue drain; keep the second response pending so that revision is visible.
    await expect.poll(async () => (await storedDraft(page))?.baseRevision).toBe(2);
    await page.clock.runFor(500);
    await expect.poll(() => mutations.length).toBe(2);
    expect(mutations[1].body.mode).toBe('save');
    expect(mutations[1].body.revision).toBe(2);
    expect(mutations[1].body.items[0].qty).toBe(17);
    releaseSecond();
    await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
    await expect.poll(() => storedDraft(page)).toBeNull();
    await expectLocalQuantity(page, drawer, 17);
    await page.clock.runFor(1500);
    expect(mutations).toHaveLength(2);
    expect(safety.blockedRequests).toEqual([]);
  } finally {
    releaseFirst();
    releaseSecond();
  }
});

test('quantity change then revert before debounce sends no save and removes the journal', async ({ page, context }) => {
  const { drawer, mutations, safety } = await openBasket(page, context);
  await drawer.getByRole('button', { name: `Increase quantity for ${product.name}`, exact: true }).dispatchEvent('click');
  await page.clock.runFor(100);
  await expectLocalQuantity(page, drawer, 16);
  await expect.poll(async () => (await storedDraft(page))?.items[0].qty).toBe(16);
  expect(mutations).toEqual([]);
  await drawer.getByRole('button', { name: `Decrease quantity for ${product.name}`, exact: true }).dispatchEvent('click');
  await page.clock.runFor(100);
  await expectLocalQuantity(page, drawer, 15);
  await expect.poll(() => storedDraft(page)).toBeNull();
  await page.clock.runFor(1500);
  expect(mutations).toEqual([]);
  expect(await storedDraft(page)).toBeNull();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  expect(safety.blockedRequests).toEqual([]);
});

test('edit while restore is in flight survives 409 and blocks further writes', async ({ page, context }) => {
  let releaseConflict;
  const conflictGate = new Promise((resolve) => { releaseConflict = resolve; });
  const remoteItems = [{ product: catalogueProducts[1], qty: 3 }];
  try {
    const { drawer, mutations, safety } = await openBasket(page, context, {
      restoreResponse: async (route) => {
        await conflictGate;
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({
          error: 'Synthetic newer account basket', items: remoteItems, activityAt: Date.now(), revision: 3,
        }) });
      },
    });
    await drawer.getByRole('button', { name: 'Clear order', exact: true }).dispatchEvent('click');
    await page.clock.runFor(500);
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0].method).toBe('DELETE');
    await expect.poll(() => storedDraft(page)).toBeNull();
    await drawer.getByRole('button', { name: 'Undo', exact: true }).dispatchEvent('click');
    await page.clock.runFor(500);
    await expect.poll(() => mutations.length).toBe(2);
    expect(mutations[1].method).toBe('PUT');
    expect(mutations[1].body.mode).toBe('save');
    expect(mutations[1].body.revision).toBe(2);
    expect(mutations[1].body.items[0].qty).toBe(15);
    expect((await storedDraft(page)).intent).toBe('restore');
    await drawer.getByRole('button', { name: `Increase quantity for ${product.name}`, exact: true }).dispatchEvent('click');
    await page.clock.runFor(100);
    await expectLocalQuantity(page, drawer, 16);
    await expect.poll(async () => (await storedDraft(page))?.items[0].qty).toBe(16);
    releaseConflict();
    await expect(drawer.getByText('Support code: cart_conflict', { exact: true })).toBeVisible();
    await expectLocalQuantity(page, drawer, 16);
    await expect(drawer.locator(`[data-cart-product-id="${remoteItems[0].product.id}"]`)).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Retry account basket sync', exact: true }).dispatchEvent('click');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.runFor(3500);
    expect(mutations).toHaveLength(2);
    await expectLocalQuantity(page, drawer, 16);
    expect((await storedDraft(page)).items[0].qty).toBe(16);
    expect(safety.blockedRequests).toEqual([]);
  } finally {
    releaseConflict();
  }
});
