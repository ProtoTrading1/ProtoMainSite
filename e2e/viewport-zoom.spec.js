import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('viewport metadata allows user zoom while retaining responsive layout defaults', async ({ page }) => {
  await page.goto('/');

  const viewport = page.locator('meta[name="viewport"]');
  await expect(viewport).toHaveCount(1);
  const content = await viewport.getAttribute('content');
  const directives = new Map(content.split(',').map((part) => {
    const [key, value] = part.trim().split('=');
    return [key, value];
  }));

  expect(directives.get('width')).toBe('device-width');
  expect(directives.get('initial-scale')).toBe('1.0');
  expect(directives.get('viewport-fit')).toBe('cover');
  expect(directives.has('minimum-scale')).toBe(false);
  expect(directives.has('maximum-scale')).toBe(false);
  expect(directives.has('user-scalable')).toBe(false);
});

test('signed-in catalogue reflows at 320 CSS pixels with phone navigation controls in view', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true });
  const safety = { blockedRequests: [] };
  await installAccessibilityServices(context, { safety });
  const page = await context.newPage();

  try {
    await signInCatalogue(page);
    await expect(page.locator('.mobile-tab-bar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'My profile' })).toBeVisible();

    const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
    for (const label of ['Home', 'Search', 'Categories', 'Cart']) {
      await expect(mobileNavigation.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    }

    const layout = await page.evaluate(() => {
      const rect = (element) => {
        const { left, right, width } = element.getBoundingClientRect();
        return { left, right, width };
      };
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        header: rect(document.querySelector('.app-header--premium')),
        product: rect(document.querySelector('.product-card')),
        profile: rect(document.querySelector('.header-icon-mobile--profile')),
        mobileNavigation: rect(document.querySelector('.mobile-tab-bar')),
      };
    });

    expect(layout.viewportWidth).toBe(320);
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    for (const key of ['header', 'product', 'profile', 'mobileNavigation']) {
      expect(layout[key].left, `${key} begins inside the viewport`).toBeGreaterThanOrEqual(0);
      expect(layout[key].right, `${key} ends inside the viewport`).toBeLessThanOrEqual(layout.viewportWidth);
    }
    expect(safety.blockedRequests).toEqual([]);
    const screenshot = testInfo.outputPath('catalogue-320.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach('catalogue-320', { path: screenshot, contentType: 'image/png' });
  } finally {
    await context.close();
  }
});
