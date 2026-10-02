import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('rejected basket stays intact and explicit retry restores checkout', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], price: 250 };
  const items = [{ product, qty: 15 }];
  await installAccessibilityServices(context, { products: [product], cartItems: items });
  let attempts = 0;
  let failing = true;
  const submittedBodies = [];
  await context.route('**/api/account-cart', async (route) => {
    attempts += 1;
    submittedBodies.push(route.request().postDataJSON());
    const failed = failing;
    await route.fulfill({ status: failed ? 400 : 200, contentType: 'application/json',
      body: JSON.stringify(failed ? { error: 'Basket activity time is invalid' }
        : { items, activityAt: Date.now(), revision: 2 }) });
  });
  await context.addInitScript(({ items }) => {
    localStorage.setItem('proto_cart', JSON.stringify(items));
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now() - 60000));
  }, { items });
  await signInCatalogue(page);
  const trigger = page.locator('[data-cart-trigger]').filter({ visible: true }).first();
  await trigger.click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.getByText('Basket sync needs attention')).toBeVisible();
  const retry = drawer.getByRole('button', { name: 'Retry account basket sync', exact: true });
  await expect(retry).toBeEnabled();
  await expect(drawer.getByRole('button', { name: 'Loading account basket…', exact: true })).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
  const failedAttempts = attempts;
  await page.waitForTimeout(3500);
  expect(attempts).toBe(failedAttempts); // Invalid input must not be hammered automatically.
  failing = false;
  await retry.click();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toBeEnabled();
  expect(attempts).toBe(failedAttempts + 1);
  expect(submittedBodies[0].items).toEqual(items);
  expect(submittedBodies.at(-1).items).toEqual(items);
});
