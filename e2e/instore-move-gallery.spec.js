import { test, expect } from '@playwright/test';

test('a moved existing product retains all 200 customer-facing photos on desktop and mobile', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('https://images.example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#8b1a1a"/></svg>' }));
  await context.route('**/api/stock*', route => route.fulfill({ json: { qty: 20, sku: 'SYNTHETIC-MOVE', unitsOfIssue: 'EACH', unitsOfIssueRaw: 'EACH', unitsOfIssueVerified: true, unitsOfIssueSource: 'positill_live', availability: { state: 'in_stock', canOrder: true } } }));
  await page.goto('/e2e/fixtures/instore-move-gallery.html');
  await page.locator('.product-image-button').click();
  await expect(page.locator('.pz-gallery-thumb')).toHaveCount(200);
  await page.getByRole('button', { name: 'View image 200', exact: true }).click();
  await expect(page.locator('.pz-main-image-img')).toHaveAttribute('src', /kept-199/);
  await expect.poll(() => page.locator('.pz-main-image-img').evaluate(i => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  expect(errors).toEqual([]);
});
