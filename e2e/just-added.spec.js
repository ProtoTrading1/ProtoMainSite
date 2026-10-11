import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const products = [
  { ...catalogueProducts[0], name: 'New blue notebook', title: 'New blue notebook', isNew: true, categoryPath: ['stationery'] },
  { ...catalogueProducts[1], name: 'Ordinary pink notebook', title: 'Ordinary pink notebook', isNew: false, categoryPath: ['stationery'] },
  { ...catalogueProducts[2], name: 'New unavailable pencils', title: 'New unavailable pencils', isNew: true, stockOnHand: 0, stockQty: 0, inStock: false, categoryPath: ['craft'] },
  { ...catalogueProducts[0], id: 'OLD-SIBLING', sku: 'OLD-SIBLING', name: 'Old blue notebook sibling', title: 'Old blue notebook sibling', isNew: false, categoryPath: ['stationery'] },
  { ...catalogueProducts[0], id: 'SPECIAL-ONLY', sku: 'SPECIAL-ONLY', code: 'SPECIAL-ONLY', barcode: 'SPECIAL-ONLY', name: 'Configured special only', title: 'Configured special only', isNew: false },
];

async function setup(context, page) {
  await installAccessibilityServices(context, { products });
  await context.route('**/api/taxonomy', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ categories: [{ id: 'stationery', label: 'Stationery', children: [] }, { id: 'craft', label: 'Craft', children: [] }] }) }));
  await context.route('**/api/products?identifier=*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('identifier');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(products.filter((row) => [row.sku, row.barcode].includes(query))) });
  });
  await context.route('**/api/specials', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ productId: 'SPECIAL-ONLY', specialPrice: 10 }] }) }));
  await signInCatalogue(page);
  const dismiss = page.getByRole('button', { name: 'Dismiss search tip' });
  if (await dismiss.isVisible()) await dismiss.click();
}

async function selectCollection(page, name) {
  if ((page.viewportSize()?.width || 1440) < 901) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Categories', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Browse categories' });
    const specials = menu.getByRole('button', { name: 'Specials', exact: true });
    const added = menu.getByRole('button', { name: 'Just Added', exact: true });
    const left = await specials.boundingBox();
    const right = await added.boundingBox();
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    expect(right.x).toBeGreaterThan(left.x);
    await menu.getByRole('button', { name, exact: true }).click();
    await expect(menu).toHaveCount(0);
  } else {
    const nav = page.locator('.header-nav');
    await expect(nav.locator('button').filter({ hasText: 'Specials' }).locator('xpath=following-sibling::button[1]')).toHaveText('Just Added');
    await nav.getByRole('button', { name, exact: true }).click();
  }
}

test('Just Added uses curated flags; Specials still includes arrivals and configured specials; history and refresh restore scope', async ({ page, context }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(context, page);
  const grid = page.locator('.catalog-page');
  await selectCollection(page, 'Just Added');
  await expect(page).toHaveURL(/collection=just-added/);
  await expect(grid.getByRole('heading', { name: 'Just Added', exact: true })).toBeVisible();
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toBeVisible();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Old blue notebook sibling', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Configured special only', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('just-added.png'), fullPage: true });
  await selectCollection(page, 'Specials');
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('Configured special only', { exact: true })).toBeVisible();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(grid.getByRole('heading', { name: 'Just Added', exact: true })).toBeVisible();
  await page.goForward();
  await expect(grid.getByRole('heading', { name: "This Week's Specials", exact: true })).toBeVisible();
  await selectCollection(page, 'Just Added');
  await selectCollection(page, 'Just Added');
  await page.reload();
  await expect(grid.getByRole('heading', { name: 'Just Added', exact: true })).toBeVisible();
  await expect(grid.getByText('Configured special only', { exact: true })).toHaveCount(0);
  await grid.getByRole('button', { name: 'All products', exact: true }).click();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('search and clear retain Just Added; ordinary identifiers cannot bypass its flag; stock/cart eligibility remains intact', async ({ page, context }) => {
  await setup(context, page);
  await selectCollection(page, 'Just Added');
  const grid = page.locator('.catalog-page');
  const search = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' });
  const submit = async (query) => {
    if ((page.viewportSize()?.width || 1440) < 901 && !await search.isVisible()) {
      await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
    }
    await search.fill(query);
    await search.press('Enter');
  };
  await submit('notebook');
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Old blue notebook sibling', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/collection=just-added/);
  await grid.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toBeVisible();
  const unavailable = grid.locator('.product-card').filter({ hasText: 'New unavailable pencils' });
  await expect(unavailable.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  const available = grid.locator('.product-card').filter({ hasText: 'New blue notebook' });
  await available.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(available.locator('input[type="number"]')).toHaveValue('1');
  await submit('E2E-1002');
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.locator('.product-card')).toHaveCount(0);
});

test('category filtering preserves Just Added scope and counts', async ({ page, context }) => {
  await setup(context, page);
  await selectCollection(page, 'Just Added');
  await page.goto('/#/stationery?collection=just-added');
  const grid = page.locator('.catalog-page');
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Old blue notebook sibling', { exact: true })).toHaveCount(0);
  await expect(grid.locator('.product-card')).toHaveCount(1);
  await grid.getByRole('button', { name: 'All departments', exact: true }).click();
  await expect(page).toHaveURL(/collection=just-added/);
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toBeVisible();
});
