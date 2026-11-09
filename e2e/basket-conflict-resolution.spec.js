import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue } from './helpers/accessibility-services.js';

const colours = ['Silver', 'Blue', 'Beige', 'Pink', 'Turquoise'];
const products = colours.map((colour, index) => ({ ...catalogueProducts[0],
  id: `E2E-DIARY-${index}`, code: `E2E-DIARY-${index}`, sku: `E2E-DIARY-${index}`,
  barcode: 'E2E-SHARED-DIARY', name: `2027 DIARY | A5 | ${colour}`, price: 79.5 }));
const local = products.map((product, index) => ({ product, qty: index === 0 ? 2 : 3, preference: colours[index] }));
const remoteItems = [{ product: products[0], qty: 1, preference: colours[0] }];

async function openConflict(page, context, options = {}) {
  const safety = await installAccessibilityServices(context, { products, cartItems: remoteItems });
  let server = { items: remoteItems, revision: 8, activityAt: Date.now() - 10000 };
  const saves = [];
  let reads = 0;
  await context.route('**/api/account-cart', async (route) => {
    if (new URL(route.request().url()).origin !== LOCAL_ORIGIN) return route.abort();
    const method = route.request().method();
    if (method === 'GET') {
      reads += 1;
      if (options.onRead) await options.onRead(route, reads);
      if (options.readFailure) return route.fulfill({ status: 503, json: { error: 'Synthetic outage' } });
    }
    const body = method === 'GET' ? null : route.request().postDataJSON();
    if (body?.mode === 'save') {
      saves.push(body);
      if (options.race && saves.length === 1) {
        server = { ...server, items: [{ product: products[1], qty: 6 }], revision: 9 };
      }
      if (body.revision !== server.revision) return route.fulfill({ status: 409, json: server });
      if (options.onSave) await options.onSave(route, saves.length);
      server = { items: body.items, activityAt: body.activityAt, revision: server.revision + 1 };
    }
    if (method === 'DELETE') {
      if (body.revision !== server.revision) return route.fulfill({ status: 409, json: server });
      server = { items: [], activityAt: body.activityAt, revision: server.revision + 1 };
    }
    return route.fulfill({ status: 200, json: server });
  });
  await context.addInitScript(({ local, accountId }) => {
    // Seed once so an actual reload verifies the recovered storage rather than
    // reintroducing the original conflict fixture.
    if (localStorage.getItem('synthetic-conflict-seeded')) return;
    localStorage.setItem('synthetic-conflict-seeded', 'true');
    localStorage.setItem('proto_cart', JSON.stringify(local));
    localStorage.setItem('proto_cart_owner', accountId);
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now() - 60000));
    localStorage.setItem(`proto_cart_pending_${accountId}`, JSON.stringify({ accountId,
      items: local, activityAt: Date.now() - 60000, baseRevision: 7, type: 'save', intent: 'normal' }));
  }, { local, accountId: ACCOUNT_ID });
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.getByText('Support code: cart_conflict', { exact: true })).toBeVisible();
  return { drawer, saves, safety, server: () => server, reads: () => reads };
}

async function expectLocalItems(drawer, quantities = local.map(({ qty }) => qty)) {
  await expect(drawer.locator('[data-cart-product-id]')).toHaveCount(5);
  for (let index = 0; index < products.length; index++) {
    await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${products[index].code} (${colours[index]})`, exact: true }))
      .toHaveValue(String(quantities[index]));
  }
}

async function backups(page) {
  return page.evaluate((id) => Object.keys(localStorage)
    .filter((key) => key.startsWith(`proto_cart_recovery_${id}_`))
    .map((key) => JSON.parse(localStorage.getItem(key))), ACCOUNT_ID);
}

test('customer keeps all five diary colours and quantities, reaches review, and survives reload', async ({ page, context }) => {
  const { drawer, saves, server, safety } = await openConflict(page, context);
  await expectLocalItems(drawer);
  await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
  expect(saves).toHaveLength(0);
  await page.screenshot({ path: `../conflict-before-${test.info().project.name}.png`, fullPage: true });
  await drawer.getByRole('button', { name: 'Keep these items and sync', exact: true }).last().click();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  await expectLocalItems(drawer);
  expect(saves).toHaveLength(1);
  expect(saves[0].revision).toBe(8);
  expect(server().items.map(({ qty, preference }) => ({ qty, preference })))
    .toEqual(local.map(({ qty, preference }) => ({ qty, preference })));
  const copies = await backups(page);
  expect(copies).toHaveLength(1);
  expect(copies[0].local.items.map(({ qty }) => qty)).toEqual([2, 3, 3, 3, 3]);
  expect(copies[0].remote.items).toEqual(remoteItems);
  await drawer.getByRole('button', { name: 'Review order request', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /review|confirm|order/i }).last()).toBeVisible();
  await page.screenshot({ path: `../conflict-recovered-${test.info().project.name}.png`, fullPage: true });
  await page.reload();
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  await expectLocalItems(drawer);
  expect((await backups(page))).toHaveLength(1);
  const orders = [];
  await context.route('**/api/send-order', async (route) => {
    if (new URL(route.request().url()).origin !== LOCAL_ORIGIN) return route.abort();
    orders.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, json: { success: true, orderId: 'SYNTHETIC-RECOVERED', orderNumber: 'E2E-RECOVERED' } });
  });
  await context.route('**/api/customer-profile', async (route) => {
    if (new URL(route.request().url()).origin !== LOCAL_ORIGIN) return route.abort();
    return route.fulfill({ status: 200, json: { profile: { id: ACCOUNT_ID, whatsapp_opt_in: false } } });
  });
  await drawer.getByRole('button', { name: 'Review order request', exact: true }).click();
  await expect(page.locator('.checkout-review-line')).toHaveCount(5);
  await page.getByRole('button', { name: 'Continue to options', exact: true }).click();
  const noUpdates = page.getByRole('button', { name: 'No WhatsApp updates', exact: true });
  if (await noUpdates.isVisible()) await noUpdates.click();
  await page.getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  await page.getByRole('button', { name: /Pick up in store/ }).click();
  await page.getByRole('button', { name: 'Send order request — no payment now', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order request received. Thank you.', exact: true })).toBeVisible();
  expect(orders).toHaveLength(1);
  expect(orders[0].items.map(({ qty, preference }) => ({ qty, preference })))
    .toEqual(local.map(({ qty, preference }) => ({ qty, preference })));
  await expect.poll(() => server().items).toEqual([]);
  expect((await backups(page))).toHaveLength(1);
  await page.screenshot({ path: `../conflict-order-received-${test.info().project.name}.png`, fullPage: true });
  expect(safety.blockedRequests).toEqual([]);
});

test('another device changes again during recovery: no silent overwrite or lost local items', async ({ page, context }) => {
  const { drawer, saves, server } = await openConflict(page, context, { race: true });
  await drawer.getByRole('button', { name: 'Keep these items and sync', exact: true }).last().click();
  await expect(drawer.getByText('Support code: cart_conflict', { exact: true })).toBeVisible();
  await expectLocalItems(drawer);
  expect(saves).toHaveLength(1);
  expect(server().items[0].qty).toBe(6);
  await drawer.getByRole('button', { name: 'Keep these items and sync', exact: true }).last().click();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  expect(saves.map(({ revision }) => revision)).toEqual([8, 9]);
  expect((await backups(page))).toHaveLength(2);
  await expectLocalItems(drawer);
});

test('connection failure during recovery keeps the draft and checkout blocked', async ({ page, context }) => {
  const { drawer, saves } = await openConflict(page, context, { readFailure: true });
  await drawer.getByRole('button', { name: 'Keep these items and sync', exact: true }).last().click();
  await expect(drawer.getByText('Support code: cart_connection', { exact: true })).toBeVisible();
  await expectLocalItems(drawer);
  expect(saves).toHaveLength(0);
  await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
});

test('storage full prevents replacement while preserving the visible basket', async ({ page, context }) => {
  const { drawer, saves, server } = await openConflict(page, context);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('proto_cart_recovery_')) throw new DOMException('Synthetic full storage', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await drawer.getByRole('button', { name: 'Keep these items and sync', exact: true }).last().click();
  await expect(drawer.getByText('Support code: cart_backup', { exact: true })).toBeVisible();
  await expectLocalItems(drawer);
  expect(saves).toHaveLength(0);
  expect(server().items).toEqual(remoteItems);
});

test('edits made while recovery reads the account are preserved and cannot submit early', async ({ page, context }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started;
  const reading = new Promise((resolve) => { started = resolve; });
  const { drawer, saves } = await openConflict(page, context, { onRead: async () => { started(); await gate; } });
  await drawer.getByRole('button', { name: 'Keep these items and sync', exact: true }).last().click();
  await reading;
  const quantity = drawer.getByRole('spinbutton', { name: `Quantity for ${products[0].code} (${colours[0]})`, exact: true });
  await quantity.fill('4');
  await quantity.blur();
  await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
  release();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  expect(saves[0].items[0].qty).toBe(4);
  await expectLocalItems(drawer, [4, 3, 3, 3, 3]);
});
