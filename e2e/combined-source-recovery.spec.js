import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

for (const source of ['unknown', 'conflicting', 'explicit-main']) {
  test(`profile reorder ${source} source survives a current catalogue SKU collision safely`, async ({ page, context }) => {
    const products = catalogueProducts.slice(0, 2).map(product => ({ ...product, price: 250, source: 'main', isExtendedRange: false }));
    const current = { product: products[1], qty: 4 };
    const historical = { productId: products[0].id, code: products[0].code, name: 'Historical synthetic product', unitPrice: 10, qty: 4,
      ...(source === 'explicit-main' ? { source: 'main', isExtendedRange: false } : {}),
      ...(source === 'conflicting' ? { source: 'main', isExtendedRange: true } : {}) };
    const lastOrder = { id: 'SYNTHETIC-REORDER', order_number: 'SYNTHETIC-REORDER', created_at: new Date().toISOString(), status: 'received', total: 40, items: [historical] };
    const safety = await installAccessibilityServices(context, { products, cartItems: [current], lastOrder });
    await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
    await signInCatalogue(page);
    await page.getByRole('button', { name: /^My profile$/i }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: 'View order', exact: true }).click();
    await page.getByRole('button', { name: 'Review & reorder available items', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Reorder', exact: true });
    await modal.getByRole('button', { name: 'Add 1 item to order', exact: true }).click();
    if (source === 'explicit-main') {
      await expect(modal).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart')).length)).toBe(2);
      const canonical = await page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart')));
      expect(canonical.find(item => item.product.id === products[0].id).product).toMatchObject({ source: 'main', isExtendedRange: false });
      expect(canonical.find(item => item.product.id === products[0].id).product.price).toBe(250);
      expect(canonical.find(item => item.product.id === products[1].id).qty).toBe(4);
    } else {
      await expect(modal.getByRole('status')).toContainText(/source review/i);
      await expect(modal.getByRole('status')).toContainText('0 items added.');
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart')))).toEqual([current]);
    }
    expect(safety.blockedRequests).toEqual([]);
  });
}
