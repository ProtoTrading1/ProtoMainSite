import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';
import { withChristmasPenGroup } from '../api/_christmas-pen-group.js';

const entries = [...withChristmasPenGroup(null)];
const rows = entries.map(([sku, info]) => ({
  ...catalogueProducts[0], id: sku, sku, code: sku, barcode: sku,
  name: info.variantLabel, title: info.variantLabel, description: `Description for ${sku}`, image: `/bag_black.png?style=${sku}`, isNew: true, ...info,
}));

test('Christmas pen card offers ten independently identified styles', async ({ page, context }) => {
  await installAccessibilityServices(context, { products: rows });
  await context.route('**/api/sort-orders', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ orders: { 'collection:just-added': { skuOrder: [], updatedAt: null } } }) }));
  await signInCatalogue(page);
  const tip = page.getByRole('button', { name: 'Dismiss search tip' });
  if (await tip.isVisible()) await tip.click();
  await page.goto('/#/?collection=just-added');
  const card = page.locator('.product-card');
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: /choose option/i }).click();
  const options = page.getByRole('radiogroup', { name: 'Select a variant' });
  await expect(options.getByRole('radio')).toHaveCount(10);
  await expect(options.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add 1 to order' })).toHaveCount(0);
  for (const sku of ['8622000156', '8622000159', '8622000161']) {
    const option = options.locator(`[data-variant-id="${sku}"]`);
    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.pz-main-image-img')).toHaveAttribute('src', new RegExp(`style=${sku}`));
  }
  await page.getByRole('button', { name: 'Add 1 to order' }).click();
  await expect(page.getByRole('status').filter({ hasText: /cart updated\. 1 item/i })).toBeAttached();
  await page.getByRole('dialog', { name: 'Truck with gifts' }).getByRole('button', { name: 'Close', exact: true }).click();
  const cartName = (page.viewportSize()?.width || 1440) < 901 ? /^cart 1$/i : /open cart\. 1 item/i;
  await page.getByRole('button', { name: cartName }).click();
  await expect(page.getByText('Truck with gifts', { exact: true }).last()).toBeVisible();
});

test('an exact style search never silently selects the primary pen', async ({ page, context }) => {
  await installAccessibilityServices(context, { products: rows });
  await context.route('**/api/sort-orders', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ orders: { 'collection:just-added': { skuOrder: [], updatedAt: null } } }) }));
  await signInCatalogue(page);
  const tip = page.getByRole('button', { name: 'Dismiss search tip' });
  if (await tip.isVisible()) await tip.click();
  await page.goto('/#/?q=8622000161&collection=just-added');
  const card = page.locator('.product-card');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('heading', { name: 'Truck with gifts', exact: true })).toBeVisible();
  await expect(card.getByText('SKU: 8622000161', { exact: false })).toBeVisible();
  await expect(card.locator('img').first()).toHaveAttribute('src', /style=8622000161/);
  await card.getByRole('button', { name: /choose option/i }).click();
  await expect(page.getByRole('dialog').getByText('Description for 8622000161')).toBeVisible();
  const options = page.getByRole('radiogroup', { name: 'Select a variant' });
  await expect(options.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add 1 to order' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('dialog').getByText('Description for 8622000161')).toBeVisible();
  await expect(options.getByRole('radio')).toHaveCount(10);
  await expect(options.getByRole('radio', { checked: true })).toHaveCount(0);
  const truck = options.locator('[data-variant-id="8622000161"]');
  await truck.click();
  await expect(truck).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('dialog').getByText(/SKU: 8622000161/)).toBeVisible();
  await page.goto('/#/?product=8622000161');
  await page.reload();
  await expect(page.getByRole('dialog').getByText('Description for 8622000161')).toBeVisible();
  await expect(options.getByRole('radio')).toHaveCount(10);
  await expect(options.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(page).toHaveURL(/product=8622000161/);
});

test('one featured family member still shows the whole pen group', async ({ page, context }) => {
  await installAccessibilityServices(context, { products: rows });
  await context.route('**/api/featured-products', (route) => route.fulfill({ json: { items: [{ sku: '8622000162' }] } }));
  await context.route('**/api/products?*', (route) => {
    const url = new URL(route.request().url());
    const result = url.searchParams.has('skus')
      ? rows.filter((row) => url.searchParams.get('skus').split(',').includes(row.sku))
      : rows;
    return route.fulfill({ json: result });
  });
  await signInCatalogue(page);
  const card = page.locator('.product-card');
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: /choose option/i }).click();
  await expect(page.getByRole('radiogroup', { name: 'Select a variant' }).getByRole('radio')).toHaveCount(10);
});
