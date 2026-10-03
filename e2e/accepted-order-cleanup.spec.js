import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, TEST_EMAIL, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('accepted receipt warns on storage and clear failure; cleanup retry never resubmits', async ({ page, context }) => {
  const safety = await installAccessibilityServices(context, { cartItems: [{ product: catalogueProducts[0], qty: 20 }] });
  await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await context.route('**/api/customer-profile*', route => route.fulfill({ json: { profile: { id: ACCOUNT_ID, email: TEST_EMAIL, name: 'Synthetic Customer', role: 'customer', is_approved: true, accept_whatsapp: false } } }));
  await context.addInitScript(() => {
    window.__denyReceiptStorage = false;
    for (const name of ['getItem', 'setItem', 'removeItem']) {
      const original = Storage.prototype[name];
      Storage.prototype[name] = function (...args) {
        if (window.__denyReceiptStorage) throw new DOMException('Synthetic storage denial', 'SecurityError');
        return original.apply(this, args);
      };
    }
  });
  let failClear = true;
  let cart = { items: [{ product: catalogueProducts[0], qty: 20 }], activityAt: Date.now(), revision: 1 };
  let deletes = 0;
  await context.route('**/api/account-cart', route => {
    if (route.request().method() === 'DELETE') {
      deletes++;
      if (failClear) return route.fulfill({ status: 503, json: { error: 'Synthetic clear outage' } });
      cart = { items: [], activityAt: Date.now(), revision: cart.revision + 1 };
    }
    return route.fulfill({ json: cart });
  });
  const accepted = [];
  await context.route('**/api/send-order', async route => {
    accepted.push(route.request().postDataJSON());
    await page.evaluate(() => { window.__denyReceiptStorage = true; });
    return route.fulfill({ json: { success: true, orderId: 'SYNTHETIC-RECEIPT', orderNumber: 'SYNTHETIC-RECEIPT' } });
  });
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Review order request', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review your order request', exact: true }).getByRole('button', { name: 'Continue to options', exact: true }).click();
  await page.getByRole('dialog', { name: 'Order request options', exact: true }).getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  const delivery = page.getByRole('dialog', { name: 'Choose delivery for your order request', exact: true });
  await delivery.getByRole('button', { name: /Pick up in store/ }).click();
  await delivery.getByRole('button', { name: /^Send order request.*no payment now$/ }).click();
  const receipt = page.getByRole('dialog', { name: 'Order request received. Thank you.', exact: true });
  await expect(receipt.getByRole('alert')).toContainText('Order SYNTHETIC-RECEIPT was received. Do not resubmit it.');
  await expect(receipt.getByRole('alert')).toContainText('Keep this page open');
  await expect.poll(() => deletes).toBeGreaterThan(0);
  expect(accepted).toHaveLength(1);
  failClear = false;
  await page.evaluate(() => { window.__denyReceiptStorage = false; });
  await receipt.getByRole('button', { name: 'Retry basket cleanup', exact: true }).click();
  await expect.poll(() => cart.items.length).toBe(0);
  await expect(receipt.getByRole('alert')).toHaveCount(0);
  expect(accepted).toHaveLength(1);
  expect(safety.blockedRequests).toEqual([]);
});
