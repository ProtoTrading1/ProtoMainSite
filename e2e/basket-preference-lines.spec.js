import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue } from './helpers/accessibility-services.js';

const product = { ...catalogueProducts[0], price: 250, isExtendedRange: true, stockOnHand: 10, stockQty: 10 };
const line = (preference, qty) => ({ product, preference, qty });

async function setup(context, cartItems, lastOrder = null) {
  const safety = await installAccessibilityServices(context, { products: [product], cartItems, lastOrder });
  const writes = [];
  let cart = { items: cartItems, activityAt: Date.now(), revision: 1 };
  await context.route('**/api/account-cart', async (route) => {
    if (new URL(route.request().url()).origin !== LOCAL_ORIGIN) return route.abort();
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      writes.push(body);
      if (body.mode === 'save') cart = { items: body.items, activityAt: body.activityAt, revision: cart.revision + 1 };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cart) });
  });
  return { safety, writes };
}

test('same-SKU preference quantities cap collectively and removal preserves sibling after save/reload', async ({ page, context }) => {
  const { safety, writes } = await setup(context, [line('Red', 2), line('blue', 3)]);
  const keyErrors = [];
  page.on('console', (message) => { if (/same key|unique.*key/i.test(message.text())) keyErrors.push(message.text()); });
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  const red = drawer.getByRole('spinbutton', { name: `Quantity for ${product.code} (Red)`, exact: true });
  const blue = drawer.getByRole('spinbutton', { name: `Quantity for ${product.code} (blue)`, exact: true });
  await expect(red).toHaveValue('2');
  await expect(blue).toHaveValue('3');
  await red.fill('8');
  await red.press('Enter');
  await expect(red).toHaveValue('7');
  await expect(blue).toHaveValue('3');
  await expect(drawer.getByRole('button', { name: `Increase quantity for ${product.name} (Red)`, exact: true })).toBeDisabled();
  await expect.poll(() => writes.filter((body) => body.mode === 'save').at(-1)?.items.map(({ qty }) => qty)).toEqual([7, 3]);
  await drawer.getByRole('button', { name: `Remove ${product.name} (Red) from cart`, exact: true }).click();
  await expect(red).toHaveCount(0);
  await expect(blue).toHaveValue('3');
  await expect.poll(() => writes.filter((body) => body.mode === 'save').at(-1)?.items.map(({ qty, preference }) => ({ qty, preference }))).toEqual([{ qty: 3, preference: 'blue' }]);
  await page.reload();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(blue).toHaveValue('3');
  await expect(red).toHaveCount(0);
  expect(keyErrors).toEqual([]);
  expect(safety.blockedRequests.filter((path) => /send-order|register-trade|reset|product-request/.test(path))).toEqual([]);
});

test('legacy case/whitespace duplicates merge quantities and retain display preference before save', async ({ page, context }) => {
  const { writes } = await setup(context, [line('Dark  blue', 2), line('dark blue', 3), line('Red', 1)]);
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.locator('[data-cart-line-key]')).toHaveCount(2);
  const merged = drawer.getByRole('spinbutton', { name: `Quantity for ${product.code} (Dark  blue)`, exact: true });
  await expect(merged).toHaveValue('5');
  await merged.fill('6');
  await merged.press('Enter');
  await expect.poll(() => writes.filter((body) => body.mode === 'save').at(-1)?.items.map(({ qty, preference }) => ({ qty, preference }))).toEqual([
    { qty: 6, preference: 'Dark  blue' }, { qty: 1, preference: 'Red' },
  ]);
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
});

test('legacy merged quantity above 9999 stays visible until the customer explicitly corrects it', async ({ page, context }) => {
  const { writes } = await setup(context, [line('Red', 6000), line('red', 6000)]);
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  const retained = drawer.getByRole('spinbutton', { name: `Quantity for ${product.code} (Red)`, exact: true });
  await expect(retained).toHaveValue('12000');
  await expect(drawer.getByText(/reduce by 11990/)).toBeVisible();
  expect(writes.filter((body) => body.mode === 'save')).toHaveLength(0);
  await retained.fill('10');
  await retained.press('Enter');
  await expect(retained).toHaveValue('10');
  await expect.poll(() => writes.filter((body) => body.mode === 'save').at(-1)?.items.map(({ qty }) => qty)).toEqual([10]);
});

test('reorder caps all same-SKU preferences and flags only the shortfall line', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'Desktop reorder control; shared mutation behavior covered on mobile by sibling edit tests.');
  const lastOrder = { id: 'synthetic-order', created_at: new Date().toISOString(), items: [
    { productId: product.id, code: product.code, name: product.name, preference: 'red', qty: 4, unitPrice: 250, source: 'main', isExtendedRange: false },
    { productId: product.id, code: product.code, name: product.name, preference: 'green', qty: 4, unitPrice: 250, source: 'main', isExtendedRange: false },
  ] };
  const { writes, safety } = await setup(context, [line('Red', 2), line('blue', 3)], lastOrder);
  await signInCatalogue(page);
  await page.locator('.header-nav').getByRole('button', { name: 'Reorder', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Reorder', exact: true });
  await dialog.getByRole('button', { name: 'Add 2 items to order', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('1 requested line could not be added in full');
  const rows = dialog.locator('label');
  await expect(rows.nth(0)).not.toContainText('requested quantity unavailable');
  await expect(rows.nth(1)).toContainText('requested quantity unavailable');
  await expect.poll(() => writes.filter((body) => body.mode === 'save').at(-1)?.items.map(({ qty, preference }) => ({ qty, preference }))).toEqual([
    { qty: 6, preference: 'Red' }, { qty: 3, preference: 'blue' }, { qty: 1, preference: 'green' },
  ]);
  expect(safety.blockedRequests.filter((path) => /send-order|register-trade|reset|product-request/.test(path))).toEqual([]);
});
