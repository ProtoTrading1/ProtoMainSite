import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue } from './helpers/accessibility-services.js';

for (const conflict of [false, true]) {
  test(`pending basket after reload ${conflict ? 'preserves both copies on conflict' : 'resumes against its original revision'}`, async ({ page, context }) => {
    const product = { ...catalogueProducts[0], price: 250 };
    const local = [{ product, qty: 15 }];
    let server = { items: [{ product, qty: 4 }], activityAt: Date.now() - 10000, revision: conflict ? 8 : 7 };
    const requests = [];
    await installAccessibilityServices(context, { products: [product], cartItems: server.items });
    await context.route('**/api/account-cart', async (route) => {
      if (new URL(route.request().url()).origin !== LOCAL_ORIGIN) return route.abort();
      const body = route.request().method() === 'GET' ? null : route.request().postDataJSON();
      requests.push(body);
      if (body?.mode === 'save') {
        expect(body.revision).toBe(7);
        expect(conflict).toBe(false);
        server = { items: body.items, activityAt: body.activityAt, revision: 8 };
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(server) });
    });
    await context.addInitScript(({ local, accountId }) => {
      localStorage.setItem('proto_cart', JSON.stringify(local));
      localStorage.setItem('proto_cart_owner', accountId);
      localStorage.setItem('proto_cart_last_activity_at', String(Date.now() - 60000));
      localStorage.setItem(`proto_cart_pending_${accountId}`, JSON.stringify({ accountId,
        items: local, activityAt: Date.now() - 60000, baseRevision: 7, type: 'save', intent: 'normal' }));
    }, { local, accountId: ACCOUNT_ID });
    await signInCatalogue(page);
    await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
    const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
    await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true })).toHaveValue('15');
    if (conflict) {
      await expect(drawer.getByText('Support code: cart_conflict', { exact: true })).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
      await page.waitForTimeout(3500);
      expect(requests.filter((body) => body?.mode === 'save')).toHaveLength(0);
      expect(server.items[0].qty).toBe(4);
      const draft = await page.evaluate((id) => JSON.parse(localStorage.getItem(`proto_cart_pending_${id}`)), ACCOUNT_ID);
      expect(draft.items[0].qty).toBe(15);
    } else {
      await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
      await expect(drawer.getByRole('button', { name: 'Review order request', exact: true })).toBeEnabled();
      expect(server.items[0].qty).toBe(15);
      expect(requests.filter((body) => body?.mode === 'save')).toHaveLength(1);
    }
  });
}
