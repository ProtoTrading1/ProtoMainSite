import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('known zero-stock saved basket keeps quantity and can send a clearly marked request', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], stockOnHand: 0, stockQty: 0, inStock: false };
  await installAccessibilityServices(context, { products: [product], cartItems: [{ product, qty: 20, preference: 'Blue' }] });
  await context.route('**/api/stock?**', route => route.fulfill({ json: { qty: 0, to_order: false } }));
  const posts = [];
  await context.route('**/api/send-order', route => {
    posts.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, orderId: 'synthetic-shortage', orderNumber: 'TEST-SHORTAGE', emailDeliveryFailed: false } });
  });
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(page.locator('.drawer-line-stock-note')).toContainText('20 subject to confirmation');
  await page.getByRole('button', { name: 'Review order request', exact: true }).filter({ visible: true }).click();
  await expect(page.getByText('Products requested', { exact: true })).toBeVisible();
  await expect(page.getByText(/Orders are requests. Stock is shared/)).toBeVisible();
  await page.screenshot({ path: '/tmp/stock-shortage-checkout.png', fullPage: true });
  await page.getByRole('button', { name: 'Continue to options', exact: true }).click();
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  await page.getByRole('button', { name: /Pick up in store/ }).click();
  await page.getByRole('button', { name: 'Send order request — no payment now', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order request received. Thank you.' })).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].items[0].qty).toBe(20);
  expect(posts[0].items[0].preference).toBe('Blue');
});
