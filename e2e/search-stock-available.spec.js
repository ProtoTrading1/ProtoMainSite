import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

// Hermetic synthetic catalogue, auth and basket services; no live data writes.
const landed = {
  id: '8616000132W', sku: '8616000132W', code: '8616000132W', name: 'SYNTHETIC ARRIVED PACK SEARCH REVIEW',
  image: '/bag_black.png', price: 49.5, casePack: 'Pack of 50', unitsOfIssue: 'Pack of 50', minQty: 1,
  stockOnHand: -23, stockQty: -23, inStock: false, keepLiveWhenOos: true,
  availability: { state: 'landed', label: 'Landed - being received', canOrder: true, incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001 },
};
const unavailable = { ...landed, id: '8616000133W', sku: '8616000133W', code: '8616000133W', name: 'SYNTHETIC UNAVAILABLE SEARCH REVIEW', stockOnHand: 0, stockQty: 0, availability: { state: 'out_of_stock', label: 'Out of stock', canOrder: false } };
const ordinary = { ...landed, id: '8616000134W', sku: '8616000134W', code: '8616000134W', name: 'SYNTHETIC BUYABLE SEARCH REVIEW', stockOnHand: 20, stockQty: 20, inStock: true, availability: { state: 'in_stock', label: 'In stock', canOrder: true } };

test('search adds confirmed arrived stock, blocks unavailable stock and preserves ordinary ordering', async ({ page, context }, testInfo) => {
  await installAccessibilityServices(context, { products: [landed, unavailable, ordinary] });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await signInCatalogue(page);
  if ((page.viewportSize()?.width || 1440) < 901) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
  }
  const search = page.locator('input[aria-label="Search by product name, SKU or barcode"]:visible').first();
  await search.fill('8616000132W');
  const row = page.locator('.sp-product-row:visible').filter({ hasText: landed.name }).first();
  await expect(row.locator('.sp-stock-badge')).toHaveText('Stock available');
  await expect(row).toContainText('Pack of 50');
  await expect(row).toContainText('R49.50');
  await expect(row).toContainText('incl. VAT');
  await expect(row.locator('.sp-quick-add')).toBeEnabled();
  await expect(row).not.toContainText('Out of stock');
  await page.screenshot({ path: testInfo.outputPath('synthetic-landed-search.png'), animations: 'disabled' });
  await row.locator('.sp-quick-add').click();

  await search.fill('8616000133W');
  const out = page.locator('.sp-product-row:visible').filter({ hasText: unavailable.name }).first();
  await expect(out.locator('.sp-stock-badge')).toHaveText('Out of stock');
  await expect(out.locator('.sp-quick-add')).toBeDisabled();

  await search.fill('8616000134W');
  const buyable = page.locator('.sp-product-row:visible').filter({ hasText: ordinary.name }).first();
  await expect(buyable.locator('.sp-quick-add')).toBeEnabled();
  await buyable.locator('.sp-quick-add').click();
  await search.press('Escape');
  const mobile = (page.viewportSize()?.width || 1440) < 901;
  await page.locator(mobile ? '[data-cart-trigger="mobile"]' : '.cart-summary').click();
  await expect(page.locator(`[data-cart-product-id="${landed.id}"]:visible`).first()).toBeVisible();
  await expect(page.locator(`[data-cart-product-id="${ordinary.id}"]:visible`).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('synthetic-search-basket.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});
