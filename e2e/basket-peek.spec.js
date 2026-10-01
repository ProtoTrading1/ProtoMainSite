import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('each added item reveals the basket at desktop header widths', async ({ browser }, testInfo) => {
  test.setTimeout(60000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installAccessibilityServices(context);
  const page = await context.newPage();
  try {
    await signInCatalogue(page);
    for (const width of [901, 1074, 1200, 1201, 1395]) {
      await page.setViewportSize({ width, height: 900 });
      const drawer = page.locator('.cart-drawer');
      for (let item = 0; item < 2; item += 1) {
        await page.locator('.product-card').nth(item).getByRole('button', { name: 'Add to Cart', exact: true }).click();
        await expect(drawer).toHaveClass(/peek/);
        await expect(drawer).toBeVisible();
        await expect.poll(async () => (await drawer.boundingBox())?.x).toBeLessThan(width - 200);
        if (width === 1074 && item === 0) await page.screenshot({ path: testInfo.outputPath('automatic-basket-1074.png') });
        // The existing preview pauses while the pointer rests over the basket.
        await page.mouse.move(0, 0);
        await expect(drawer).not.toHaveClass(/peek/);
      }
      await page.getByRole('button', { name: /Open cart/ }).click();
      await expect(page.locator(width <= 1200 ? '.mobile-cart-backdrop .order-drawer' : '.cart-drawer .order-drawer')).toBeVisible();
      await page.keyboard.press('Escape');
    }
  } finally {
    await context.close();
  }
});

test('phone basket retains its existing bottom sheet', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installAccessibilityServices(context);
  const page = await context.newPage();
  try {
    await signInCatalogue(page);
    await page.locator('.product-card').first().getByRole('button', { name: 'Add to Cart', exact: true }).click();
    await expect(page.locator('.cart-drawer')).toBeHidden();
    await page.locator('[data-cart-trigger="mobile"]').click();
    await expect(page.locator('.mobile-cart-backdrop .order-drawer')).toBeVisible();
  } finally {
    await context.close();
  }
});
