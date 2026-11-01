import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const rows = [
  { ...catalogueProducts[0], name: 'New blue notebook', title: 'New blue notebook', isNew: true },
  { ...catalogueProducts[1], name: 'Ordinary pink notebook', title: 'Ordinary pink notebook', isNew: false },
];

test('Just Added shows flagged arrivals, keeps scope on refresh and does not invent a special', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await installAccessibilityServices(context, { products: rows });
  await context.route('**/api/sort-orders', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ orders: { 'collection:just-added': { skuOrder: [], updatedAt: null } } }) }));
  await signInCatalogue(page);
  const tip = page.getByRole('button', { name: 'Dismiss search tip' });
  if (await tip.isVisible()) await tip.click();
  if ((page.viewportSize()?.width || 1440) < 901) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Categories', exact: true }).click();
    await page.getByRole('dialog', { name: 'Browse categories' }).getByRole('button', { name: 'Just Added', exact: true }).click();
  } else {
    await page.locator('.header-nav').getByRole('button', { name: 'Just Added', exact: true }).click();
  }
  await expect(page).toHaveURL(/collection=just-added/);
  const grid = page.locator('.catalog-page');
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.locator('.pc-special-ribbon')).toHaveCount(0);
  await page.reload();
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('search remains within Just Added, including exact item-code searches', async ({ page, context }) => {
  await installAccessibilityServices(context, { products: rows });
  await context.route('**/api/sort-orders', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ orders: { 'collection:just-added': { skuOrder: [], updatedAt: null } } }) }));
  await context.route('**/api/products?identifier=*', route => {
    const query = new URL(route.request().url()).searchParams.get('identifier');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows.filter(row => [row.sku, row.barcode].includes(query))) });
  });
  await signInCatalogue(page);
  await page.goto('/#/?collection=just-added');
  const search = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' });
  if ((page.viewportSize()?.width || 1440) < 901 && !await search.isVisible()) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
  }
  await search.fill('notebook');
  await search.press('Enter');
  await expect(page).toHaveURL(/collection=just-added/);
  await expect(page.locator('.catalog-page').getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(page.locator('.catalog-page').getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  if ((page.viewportSize()?.width || 1440) < 901 && !await search.isVisible()) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
  }
  await search.fill(rows[1].sku);
  await search.press('Enter');
  await expect(page.locator('.catalog-page').getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
});
