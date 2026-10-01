import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const desktopWidths = [901, 999, 1000, 1001, 1024, 1100, 1101, 1150, 1199, 1200, 1201, 1279, 1280, 1281, 1300, 1301, 1440, 1441, 1600, 1601, 1749, 1750, 1751, 1920];

test('header controls stay within the viewport and keyboard reachable across desktop widths', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await installAccessibilityServices(context, {
    cartItems: [{ product: catalogueProducts[0], qty: 99 }],
    lastOrder: {
      id: 'E2E-ORDER', order_number: 'E2E-1',
      items: [{ productId: catalogueProducts[0].id, code: catalogueProducts[0].code, qty: 1 }],
      created_at: new Date().toISOString(),
    },
  });
  const page = await context.newPage();

  try {
    await signInCatalogue(page);
    await expect(page.locator('.cart-summary-meta small')).toHaveText('Basket');

    for (const width of [1100, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      const header = page.locator('.app-header--premium');
      const box = await header.boundingBox();
      expect(box.x + box.width, `tablet header right edge at ${width}px`).toBeLessThanOrEqual(width + 1);
      await expect(page.getByRole('button', { name: 'Home' }).first()).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Open cart/ })).toBeVisible();
    }

    for (const width of desktopWidths) {
      const height = width === 1280 ? 720 : 900;
      await page.setViewportSize({ width, height });
      const header = page.locator('.app-header--premium');
      const box = await header.boundingBox();
      expect(box, `header should render at ${width}px`).not.toBeNull();
      expect(box.x, `header left edge at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, `header right edge at ${width}px`).toBeLessThanOrEqual(width + 1);

      const controls = [
        page.getByRole('button', { name: 'Home' }).first(),
        page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' }),
        page.locator('.header-nav').getByRole('button', { name: /Reorder/ }),
        page.locator('.header-nav').getByRole('button', { name: /About Us/ }),
        page.locator('.header-nav').getByRole('button', { name: /Instore Products/ }),
        page.locator('.header-nav').getByRole('button', { name: /Specials/ }),
        page.getByRole('button', { name: 'My Profile' }),
        page.getByRole('button', { name: 'Log out' }),
        page.getByRole('button', { name: /Open cart/ }),
      ];
      const boxes = [];
      for (const control of controls) {
        await expect(control, `control visible at ${width}px`).toBeVisible();
        const controlBox = await control.boundingBox();
        expect(controlBox.x, `control left edge at ${width}px`).toBeGreaterThanOrEqual(0);
        expect(controlBox.x + controlBox.width, `control right edge at ${width}px`).toBeLessThanOrEqual(width + 1);
        boxes.push({ name: await control.getAttribute('aria-label') || await control.innerText(), box: controlBox });
        await control.focus();
        await expect(control).toBeFocused();
      }

      for (let first = 0; first < boxes.length; first += 1) {
        for (let second = first + 1; second < boxes.length; second += 1) {
          const a = boxes[first];
          const b = boxes[second];
          const horizontalOverlap = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x);
          const verticalOverlap = Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y);
          expect(horizontalOverlap > 1 && verticalOverlap > 1, `${a.name} and ${b.name} do not overlap at ${width}px`).toBe(false);
        }
      }

      if (width === 1280) {
        await page.screenshot({ path: testInfo.outputPath('header-1280.png') });
        await expect(page.locator('.cart-summary-amount')).toHaveText('R7870.50');
        const expectedFocus = [
          '.header-nav button:nth-child(2)', '.header-nav button:nth-child(3)',
          '.header-nav button:nth-child(4)', '.header-actions .header-action:first-of-type',
          '.header-actions .header-action:nth-of-type(2)',
          '.cart-summary',
        ];
        await page.locator('.header-nav button:nth-child(1)').focus();
        await expect(page.locator('.header-nav button:nth-child(1)')).toBeFocused();
        for (const selector of expectedFocus) {
          await page.keyboard.press('Tab');
          await expect(page.locator(selector)).toBeFocused();
        }
      }
    }
  } finally {
    await context.close();
  }
});

test('tablet keeps the brand, search and top basket; phone uses the bottom basket', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await installAccessibilityServices(context);
  const page = await context.newPage();

  try {
    await signInCatalogue(page);
    await expect(page.getByRole('button', { name: 'Home' }).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Open cart/ })).toBeVisible();
    for (const width of [901, 1024, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ['About Us', 'Instore Products', 'Specials']) {
        const control = page.locator('.header-nav').getByRole('button', { name, exact: true });
        await expect(control).toBeVisible();
        const box = await control.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      const basket = await page.getByRole('button', { name: /Open cart/ }).boundingBox();
      expect(basket.x + basket.width).toBeGreaterThanOrEqual(width - 25);
      expect(basket.x + basket.width).toBeLessThanOrEqual(width);
      if (width === 1024) {
        const navigation = await page.locator('.header-nav').boundingBox();
        expect(Math.abs(navigation.y - basket.y)).toBeLessThan(10);
        await page.locator('.app-header--premium').screenshot({ path: testInfo.outputPath('header-two-rows-1024.png') });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: /Open cart/ })).toBeHidden();
    const mobileCart = page.locator('[data-cart-trigger="mobile"]');
    await expect(mobileCart).toBeVisible();
    await mobileCart.focus();
    await expect(mobileCart).toBeFocused();
    const mobileCartBox = await mobileCart.boundingBox();
    expect(mobileCartBox.x).toBeGreaterThanOrEqual(0);
    expect(mobileCartBox.x + mobileCartBox.width).toBeLessThanOrEqual(391);
  } finally {
    await context.close();
  }
});
