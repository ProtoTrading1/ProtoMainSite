import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('basket restores Olive photo and keeps failed thumbnails and details contained', async ({ browser }, testInfo) => {
  const olive = { ...catalogueProducts[0], id: 'CP50ML-OLIVE', sku: 'CP50ML-OLIVE', code: 'CP50ML', name: 'CRAFT PAINT | OLIVE | 50ML', price: 16.5, image: '/images/craft-paint-50ml/14.jpg' };
  const missing = { ...catalogueProducts[1], id: 'MISSING-IMAGE', name: 'Missing image product', image: '/images/does-not-exist.jpg' };
  const empty = { ...catalogueProducts[2], id: 'EMPTY-IMAGE', name: 'Empty image product', image: '' };
  const context = await browser.newContext({ viewport: { width: 1074, height: 900 } });
  await installAccessibilityServices(context, {
    products: [olive, missing, empty],
    cartItems: [{ product: olive, qty: 2, preference: 'Olive' }, { product: missing, qty: 1 }, { product: empty, qty: 1 }],
  });
  const page = await context.newPage();
  try {
    await signInCatalogue(page);
    for (const width of [1074, 1395, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator(width <= 900 ? '[data-cart-trigger="mobile"]' : '.cart-summary').click();
      const drawer = page.locator(width <= 1200 ? '.mobile-cart-backdrop' : '.cart-drawer');
      const row = drawer.locator('[data-cart-product-id="CP50ML-OLIVE"]');
      await expect(row).toBeVisible();
      const image = row.locator('img');
      await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
      await expect(row.locator('.drawer-line-footer strong')).toHaveText('R33.00');
      const details = await row.locator('.drawer-line-body > span').evaluateAll(els => els.map(el => {
        const r = el.getBoundingClientRect(); return { text: el.textContent, top: r.top, bottom: r.bottom };
      }));
      expect(details.map(item => item.text)).toEqual(['Preferred colour/design: Olive (subject to availability)', 'CP50ML', 'Sold as: Each']);
      for (let i = 1; i < details.length; i += 1) expect(details[i].top).toBeGreaterThanOrEqual(details[i - 1].bottom - 1);
      for (const name of ['Missing image product', 'Empty image product']) {
        const fallback = drawer.getByRole('img', { name: `${name}: image unavailable`, exact: true });
        await expect(fallback).toBeVisible();
      }
      const thumb = await row.locator('.drawer-thumb').boundingBox();
      expect(thumb.width).toBe(44);
      expect(thumb.height).toBe(44);
      if (width === 1074) await row.screenshot({ path: testInfo.outputPath('olive-basket-fixed.png') });
      await page.keyboard.press('Escape');
    }
  } finally {
    await context.close();
  }
});
