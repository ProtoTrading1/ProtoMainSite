import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

mkdirSync('../preview-evidence', { recursive: true });
test('legacy device copy survives account adoption, reload, review, Cancel and explicit discard', async ({ page, context }) => {
  const products = catalogueProducts.map((p) => ({ ...p, price: 250 }));
  const account = [{ product: products[0], qty: 15 }];
  const local = [...account, { product: products[1], qty: 4 }];
  await installAccessibilityServices(context, { products, cartItems: account });
  await context.addInitScript(({ local }) => {
    if (!localStorage.getItem('proto_cart')) {
      localStorage.setItem('proto_cart', JSON.stringify(local));
      localStorage.setItem('proto_cart_last_activity_at', String(Date.now()));
    }
  }, { local });
  await signInCatalogue(page);
  const open = async () => {
    await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
    return page.locator('.order-drawer').filter({ visible: true }).first();
  };
  let drawer = await open();
  await expect(drawer.locator('[data-cart-product-id]')).toHaveCount(1);
  await drawer.getByRole('button', { name: 'Review device copy', exact: true }).click();
  await expect(drawer.getByRole('table')).toContainText('E2E-PINK');
  await expect(drawer.getByRole('table')).toContainText('4');
  await drawer.getByRole('button', { name: 'Discard device copy', exact: true }).click();
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
  const read = () => page.evaluate((id) => JSON.parse(localStorage.getItem(`proto_cart_device_copy_v1_${id}`)), ACCOUNT_ID);
  expect((await read()).items).toEqual(local);
  await page.reload();
  await expect(page.locator('.product-card').first()).toBeVisible();
  drawer = await open();
  await drawer.getByRole('button', { name: 'Review device copy', exact: true }).click();
  await drawer.screenshot({ path: `../preview-evidence/device-copy-${test.info().project.name}.png` });
  expect((await read()).items).toEqual(local);
  await drawer.getByRole('button', { name: 'Discard device copy', exact: true }).click();
  await drawer.getByRole('button', { name: 'Discard saved device copy', exact: true }).click();
  expect(await read()).toBeNull();
  await expect(drawer.locator('[data-cart-product-id]')).toHaveCount(1);
});

test('email deadline exposes retry; refresh restores draft without storing a password', async ({ page, context }) => {
  test.setTimeout(45000);
  await installAccessibilityServices(context);
  let failing = true;
  await context.route('**/api/check-registration-email', async (route) => {
    if (failing) return new Promise(() => {});
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available: true, exists: false }) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Name', { exact: true }).fill('Disposable Recovery Company');
  await page.getByPlaceholder('Full contact name').fill('Synthetic Recovery');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByPlaceholder('name@business.co.za').fill('recovery@protoe2e.co.za');
  await page.getByPlaceholder('+27').fill('0821234567');
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByPlaceholder('At least 8 characters').fill('MUST_NOT_STORE_123');
  await expect(page.getByRole('status').filter({ hasText: /email check timed out/i })).toBeVisible({ timeout: 19000 });
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeEnabled();
  const raw = await page.evaluate(() => sessionStorage.getItem('proto_registration_draft_v1'));
  expect(raw).not.toContain('MUST_NOT_STORE');
  expect(raw).not.toMatch(/password|access_token|refresh_token/i);
  failing = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /Email available/ })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Restore application details', exact: true }).click();
  await expect(page.getByPlaceholder('name@business.co.za')).toHaveValue('recovery@protoe2e.co.za');
  await expect(page.getByPlaceholder('+27')).toHaveValue('0821234567');
  await expect(page.getByPlaceholder('At least 8 characters')).toHaveValue('');
  await page.getByPlaceholder('At least 8 characters').fill('SafeRetry123!');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Billing and delivery addresses' })).toBeVisible();
  await page.screenshot({ path: `../preview-evidence/registration-recovered-${test.info().project.name}.png`, fullPage: true });
});

test('login deadline recovers and closing cancels a second attempt without a late login', async ({ page, context }) => {
  test.setTimeout(45000);
  await installAccessibilityServices(context);
  await context.route('**/mock-supabase/auth/v1/token*', () => new Promise(() => {}));
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill('recovery@protoe2e.co.za');
  await dialog.locator('input[type=password]').fill('SafeRetry123!');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(/timed out/i, { timeout: 19000 });
  await expect(dialog.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await dialog.screenshot({ path: `../preview-evidence/login-recovered-${test.info().project.name}.png` });
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await dialog.getByRole('button', { name: 'Close sign-in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => /^sb-.*-auth-token$/.test(key)));
  expect(keys).toEqual([]);
  await context.unroute('**/mock-supabase/auth/v1/token*');
  await signInCatalogue(page);
});

test('device-copy storage failure leaves the original local basket intact', async ({ page, context }) => {
  const products = catalogueProducts.map((p) => ({ ...p, price: 250 }));
  const account = [{ product: products[0], qty: 15 }];
  const local = [...account, { product: products[1], qty: 4 }];
  await installAccessibilityServices(context, { products, cartItems: account });
  await context.addInitScript(({ local }) => {
    localStorage.setItem('proto_cart', JSON.stringify(local));
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now()));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('proto_cart_device_copy_v1_')) throw new DOMException('Synthetic quota limit', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  }, { local });
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.getByRole('alert')).toContainText('could not be preserved');
  await expect(drawer.locator('[data-cart-product-id]')).toHaveCount(2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart')))).toEqual(local);
  await expect(drawer.getByRole('button', { name: 'Retry account basket sync', exact: true })).toBeEnabled();
});

test('registration draft discard clears only the application and leaves passwords blank', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await page.goto('/');
  await page.getByPlaceholder('Name', { exact: true }).fill('Discarded Synthetic Company');
  await page.getByPlaceholder('Full contact name').fill('Synthetic Contact');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('proto_registration_draft_v1'))).toContain('Discarded Synthetic Company');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore application details', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard saved application', exact: true }).click();
  expect(await page.evaluate(() => sessionStorage.getItem('proto_registration_draft_v1'))).toBeNull();
  await expect(page.getByPlaceholder('Name', { exact: true })).toHaveValue('');
});
