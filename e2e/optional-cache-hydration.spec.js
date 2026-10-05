import { test, expect } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

for (const mode of ['blocked', 'silent-open', 'silent-read']) {
  test(`actual App restores editable basket despite ${mode} optional IndexedDB`, async ({ page, context }) => {
    const basket = [{ product: catalogueProducts[0], qty: 3 }];
    const safety = await installAccessibilityServices(context, { cartItems: basket });
    await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
    await context.addInitScript(storageMode => {
      const fake = { open() {
        const request = {};
        if (storageMode === 'blocked') queueMicrotask(() => request.onblocked?.());
        if (storageMode === 'silent-read') queueMicrotask(() => {
          request.result = { close() {}, transaction() {
            return { abort() {}, objectStore() { return { get() { return {}; }, put() { return {}; }, delete() { return {}; } }; } };
          } };
          request.onsuccess?.();
        });
        return request;
      } };
      Object.defineProperty(window, 'indexedDB', { configurable: true, value: fake });
    }, mode);
    // Force the SKU resolver's live failure into its catalogue-cache fallback.
    await context.route('**/api/products?skus=*', route => route.fulfill({ status: 503, json: { error: 'Synthetic SKU failure' } }));
    await signInCatalogue(page);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart'))?.[0]?.qty)).toBe(3);
    await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
    const quantity = page.locator('.order-drawer').filter({ visible: true }).first().locator('input[type="number"]').first();
    await expect(quantity).toBeEnabled();
    await quantity.fill('4');
    await quantity.blur();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart'))?.[0]?.qty)).toBe(4);
    expect(safety.blockedRequests).toEqual([]);
  });
}
