import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue } from './helpers/accessibility-services.js';

let current;
let writes;
globalThis.basketReviewPorts = {
  approved: async () => ({ user: { id: ACCOUNT_ID } }),
  client: () => ({ from() {
    let values;
    const query = {
      select() { return query; }, eq() { return query; },
      insert(value) { values = value; writes.push(value); return query; },
      update(value) { values = value; writes.push(value); return query; },
      async maybeSingle() { if (values) current = values; return { data: current, error: null }; },
      async single() { current = values; return { data: current, error: null }; },
    };
    return query;
  } }),
};
const handlerUrl = new URL('../api/account-cart.js', import.meta.url);
let source = await readFile(handlerUrl, 'utf8');
source = source.replace("import { createClient } from '@supabase/supabase-js';", 'const createClient = globalThis.basketReviewPorts.client;')
  .replace("import { requireApprovedCustomer } from './_auth.js';", 'const requireApprovedCustomer = globalThis.basketReviewPorts.approved;')
  .replace(/from '(\.\.[^']+)'/g, (_, path) => `from '${new URL(path, handlerUrl).href}'`);
const { default: handler } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

async function setup(context, products, serverItems = []) {
  const safety = await installAccessibilityServices(context, { products, cartItems: serverItems });
  current = { items: serverItems, revision: 3, activity_at: Date.now() };
  writes = [];
  await context.route('**/api/account-cart', async route => {
    if (new URL(route.request().url()).origin !== LOCAL_ORIGIN) return route.abort();
    const request = route.request();
    let status = 200;
    let body;
    const res = { setHeader() {}, status(value) { status = value; return res; }, json(value) { body = value; return res; } };
    await handler({ method: request.method(), headers: { host: new URL(LOCAL_ORIGIN).host }, body: request.method() === 'GET' ? undefined : request.postDataJSON() }, res);
    return route.fulfill({ status, json: body });
  });
  return safety;
}
async function openCart(page) {
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  return page.locator('.order-drawer').filter({ visible: true }).first();
}
const closeCart = page => page.getByRole('button', { name: 'Close cart', exact: true }).filter({ visible: true }).first().click();
const openProduct = page => page.locator('.product-card').first().locator('.product-image-wrapper, .product-image-container, .product-image').first().click();
function addedEvents(page) {
  const events = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /journey-analytics/.test(request.url()) && request.postData()?.includes('cart_item_added')) events.push(JSON.parse(request.postData()));
  });
  return events;
}

test('legacy device-only line stays visible, editable and unsynced until explicitly removed', async ({ page, context }) => {
  const product = catalogueProducts[0];
  const legacy = { product: { ...product, id: '[OBJECT OBJECT]', sku: '[OBJECT OBJECT]', code: 'SYNTHETIC-LEGACY', name: 'Synthetic legacy option' }, qty: 2, preference: 'Existing' };
  await setup(context, [product]);
  await context.addInitScript(({ items, accountId }) => {
    if (localStorage.getItem('synthetic-legacy-seeded')) return;
    localStorage.setItem('synthetic-legacy-seeded', 'true');
    localStorage.setItem('proto_cart', JSON.stringify(items));
    localStorage.setItem('proto_cart_owner', accountId);
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now()));
  }, { items: [legacy, { product, qty: 1 }], accountId: ACCOUNT_ID });
  await signInCatalogue(page);
  let drawer = await openCart(page);
  await expect(drawer.getByText('Support code: cart_identity', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('spinbutton', { name: 'Quantity for SYNTHETIC-LEGACY (Existing)', exact: true })).toHaveValue('2');
  const remove = drawer.getByRole('button', { name: 'Remove Synthetic legacy option (Existing) from cart', exact: true });
  await expect(remove).toBeEnabled();
  await drawer.getByRole('button', { name: 'Keep these items and sync', exact: true }).first().click();
  await expect(drawer.getByText('Support code: cart_identity', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(0);
  await closeCart(page);
  await page.locator('.product-card').first().getByRole('button', { name: 'Add to Cart', exact: true }).click();
  drawer = await openCart(page);
  await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true })).toHaveValue('2');
  expect(writes).toHaveLength(0);
  await page.reload();
  await expect(page.locator('.product-card').first()).toBeVisible();
  drawer = await openCart(page);
  await expect(drawer.getByText('Support code: cart_identity', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('spinbutton', { name: 'Quantity for SYNTHETIC-LEGACY (Existing)', exact: true })).toHaveValue('2');
  await drawer.getByRole('button', { name: 'Remove Synthetic legacy option (Existing) from cart', exact: true }).click();
  await drawer.getByRole('button', { name: 'Keep these items and sync', exact: true }).first().click();
  await expect.poll(() => current.items.map(item => [item.product.id, item.qty])).toEqual([[product.id, 2]]);
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  const retained = await page.evaluate(id => Object.keys(localStorage).filter(key => key.startsWith(`proto_cart_recovery_${id}_`)).map(key => JSON.parse(localStorage.getItem(key))), ACCOUNT_ID);
  expect(retained.some(backup => backup.local.items.some(item => item.product.id === '[OBJECT OBJECT]' && item.qty === 2 && item.preference === 'Existing'))).toBe(true);
  await page.reload();
  await expect(page.locator('.product-card').first()).toBeVisible();
  drawer = await openCart(page);
  await expect(drawer.locator('[data-cart-line-key]')).toHaveCount(1);
});

test('aggregate stock rejection shows no Added label or successful add event', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], stockOnHand: 2, stockQty: 2 };
  await setup(context, [product], [{ product, qty: 2 }]);
  const events = addedEvents(page);
  await signInCatalogue(page);
  const drawer = await openCart(page);
  await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true })).toHaveValue('2');
  await closeCart(page);
  await openProduct(page);
  const add = page.getByRole('button', { name: 'Add 1 to order', exact: true });
  await add.click();
  await expect(add).toHaveText('Add 1 to order');
  await expect(page.getByRole('status').filter({ hasText: 'No additional items were added.' })).toBeAttached();
  expect(events).toHaveLength(0);
  expect(writes).toHaveLength(0);
});

test('partial stock add reports only its actual quantity', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], stockOnHand: 2, stockQty: 2 };
  await setup(context, [product], [{ product, qty: 1 }]);
  const events = addedEvents(page);
  await signInCatalogue(page);
  const drawer = await openCart(page);
  await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true })).toHaveValue('1');
  await closeCart(page);
  await openProduct(page);
  await page.locator('.pz-modal').getByRole('button', { name: 'Increase', exact: true }).click();
  await page.getByRole('button', { name: 'Add 2 to order', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Added 1 ✓', exact: true })).toBeVisible();
  await expect.poll(() => current.items[0].qty).toBe(2);
  await expect.poll(() => events.length).toBe(1);
  expect(events[0].metadata.qty).toBe(1);
});

test('line limit rejects a new product without an add-success event', async ({ page, context }) => {
  const product = catalogueProducts[0];
  const items = Array.from({ length: 250 }, (_, i) => ({ product: { ...product, id: `SYNTHETIC-${i}`, sku: `SYNTHETIC-${i}`, code: `SYNTHETIC-${i}` }, qty: 1 }));
  await setup(context, [product], items);
  const events = addedEvents(page);
  await signInCatalogue(page);
  const drawer = await openCart(page);
  await expect(drawer.locator('[data-cart-line-key]')).toHaveCount(250);
  await closeCart(page);
  await page.locator('.product-card').first().getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'reached its product line limit' })).toBeAttached();
  expect(events).toHaveLength(0);
  expect(writes).toHaveLength(0);
});

test('rapid same-event adds reserve stock once and reject the excess without success', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], stockOnHand: 2, stockQty: 2 };
  await setup(context, [product]);
  const events = addedEvents(page);
  await signInCatalogue(page);
  const drawer = await openCart(page);
  await expect(drawer.getByText('Your basket is empty', { exact: true })).toBeVisible();
  await expect(drawer.locator('.continue-shopping-button')).toBeVisible();
  await closeCart(page);
  await page.locator('.product-card').first().getByRole('button', { name: 'Add to Cart', exact: true }).evaluate(button => { button.click(); button.click(); button.click(); });
  await expect.poll(() => current.items[0]?.qty).toBe(2);
  await expect.poll(() => events.length).toBe(2);
  expect(events.map(event => event.metadata.qty)).toEqual([1, 1]);
});

for (const [label, websiteSku] of [['structured', {}], ['overlength', 'X'.repeat(161)]]) {
  test(`historical ${label} secondary identity stays readable and can be explicitly removed`, async ({ page, context }) => {
    const product = catalogueProducts[0];
    const saved = { product: { ...product, websiteSku }, qty: 2 };
    await setup(context, [product], [saved]);
    await context.addInitScript(({ saved, accountId }) => {
      if (localStorage.getItem('synthetic-alias-seeded')) return;
      localStorage.setItem('synthetic-alias-seeded', 'true');
      const product = { ...saved.product };
      delete product.sku;
      delete product.code;
      localStorage.setItem('proto_cart', JSON.stringify([{ ...saved, product }]));
      localStorage.setItem('proto_cart_owner', accountId);
      localStorage.setItem('proto_cart_last_activity_at', String(Date.now()));
    }, { saved, accountId: ACCOUNT_ID });
    await signInCatalogue(page);
    const drawer = await openCart(page);
    await expect(drawer.getByText('This product option needs checking with Proto.', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true })).toHaveValue('2');
    await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Support code: cart_identity', { exact: true })).toHaveCount(0);
    expect(current.items[0].product.websiteSku).toEqual(websiteSku);
    expect(writes).toHaveLength(0);
    await drawer.getByRole('button', { name: `Remove ${product.name} from cart`, exact: true }).click();
    await expect.poll(() => current.items.length).toBe(0);
    await page.reload();
    await expect(page.locator('.product-card').first()).toBeVisible();
    const reopened = await openCart(page);
    await expect(reopened.getByText('Your basket is empty', { exact: true })).toBeVisible();
  });
}
