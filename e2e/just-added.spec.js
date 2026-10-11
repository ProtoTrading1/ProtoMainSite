import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const products = [
  { ...catalogueProducts[0], name: 'New blue notebook', title: 'New blue notebook', isNew: true, categoryPath: ['stationery'] },
  { ...catalogueProducts[1], name: 'Ordinary pink notebook', title: 'Ordinary pink notebook', isNew: false, categoryPath: ['stationery'] },
  { ...catalogueProducts[2], name: 'New unavailable pencils', title: 'New unavailable pencils', isNew: true, stockOnHand: 0, stockQty: 0, inStock: false, categoryPath: ['craft'] },
  { ...catalogueProducts[0], id: 'OLD-SIBLING', sku: 'OLD-SIBLING', name: 'Old blue notebook sibling', title: 'Old blue notebook sibling', isNew: false, categoryPath: ['stationery'] },
  { ...catalogueProducts[0], id: 'SPECIAL-ONLY', sku: 'SPECIAL-ONLY', code: 'SPECIAL-ONLY', barcode: 'SPECIAL-ONLY', name: 'Configured special only', title: 'Configured special only', isNew: false },
];

async function setup(context, page, { catalogue = products, featured, arrivalOrder } = {}) {
  await installAccessibilityServices(context, { products: catalogue });
  if (arrivalOrder) await context.route('**/api/sort-orders', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ orders: { 'collection:just-added': { skuOrder: arrivalOrder } } }) }));
  if (featured) await context.route('**/api/featured-products', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: featured.map(({ sku }) => ({ sku })) }) }));
  await context.route('**/api/taxonomy', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ categories: [{ id: 'stationery', label: 'Stationery', children: [] }, { id: 'craft', label: 'Craft', children: [] }] }) }));
  await context.route('**/api/products?identifier=*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('identifier');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalogue.filter((row) => [row.sku, row.barcode].includes(query))) });
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
    await expect(added).toHaveCSS('background-color', /rgb\((15, 92, 89|18, 75, 73)\)/);
    await expect(added).toHaveCSS('color', 'rgb(255, 255, 255)');
    const left = await specials.boundingBox();
    const right = await added.boundingBox();
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    expect(right.x).toBeGreaterThan(left.x);
    await menu.getByRole('button', { name, exact: true }).click();
    await expect(menu).toHaveCount(0);
  } else {
    const nav = page.locator('.header-nav');
    const added = nav.getByRole('button', { name: 'Just Added', exact: true });
    await expect(added).toHaveCSS('background-color', /rgb\((15, 92, 89|18, 75, 73)\)/);
    await expect(added).toHaveCSS('color', 'rgb(255, 255, 255)');
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

test('all curated arrivals remain reachable across pages independently of the featured home list', async ({ page, context }) => {
  const arrivals = Array.from({ length: 95 }, (_, index) => {
    const sku = `ARRIVAL-${String(index + 1).padStart(3, '0')}`;
    return { ...catalogueProducts[0], id: sku, sku, code: sku, barcode: sku, name: `New arrival ${String(index + 1).padStart(3, '0')}`, title: `New arrival ${String(index + 1).padStart(3, '0')}`, isNew: true };
  });
  const ordinary = products[1];
  await setup(context, page, { catalogue: [...arrivals, ordinary], featured: [ordinary] });
  const grid = page.locator('.catalog-page');
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toBeVisible();
  await selectCollection(page, 'Just Added');
  await expect(grid.locator('.product-card')).toHaveCount(60);
  const names = await grid.locator('.product-card h3').allTextContents();
  await grid.getByRole('button', { name: /Next/ }).click();
  await expect(grid.locator('.product-card')).toHaveCount(35);
  names.push(...await grid.locator('.product-card h3').allTextContents());
  expect(new Set(names).size).toBe(95);
  expect([...names].sort()).toEqual(arrivals.map(({ name }) => name).sort());
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await grid.getByRole('button', { name: /Previous/ }).click();
  await expect(grid.locator('.product-card')).toHaveCount(60);
});

test('published exact-SKU order ranks arrivals, appends unranked arrivals and respects customer sorting', async ({ page, context }) => {
  const arrivals = [
    { ...products[0], id: 'NEW-A', sku: 'NEW-A', barcode: 'NEW-A', name: 'Arrival A', title: 'Arrival A' },
    { ...products[0], id: 'NEW-B', sku: 'NEW-B', barcode: 'NEW-B', name: 'Arrival B', title: 'Arrival B' },
    { ...products[0], id: 'NEW-C', sku: 'NEW-C', barcode: 'NEW-C', name: 'Arrival C', title: 'Arrival C' },
  ];
  await setup(context, page, { catalogue: [...arrivals, products[1]], arrivalOrder: ['MISSING-SKU', products[1].id, 'NEW-C', 'NEW-A'] });
  await selectCollection(page, 'Just Added');
  const grid = page.locator('.catalog-page');
  const names = grid.locator('.product-card h3');
  await expect(names).toHaveText(['Arrival C', 'Arrival A', 'Arrival B']);
  await grid.locator('select').selectOption('name-asc');
  await expect(names).toHaveText(['Arrival A', 'Arrival B', 'Arrival C']);
  await grid.locator('select').selectOption('featured');
  await expect(names).toHaveText(['Arrival C', 'Arrival A', 'Arrival B']);
  await page.reload();
  await expect(names).toHaveText(['Arrival C', 'Arrival A', 'Arrival B']);
});

test('Just Added keeps white text on teal hover and visible keyboard focus', async ({ page, context }) => {
  await setup(context, page);
  if ((page.viewportSize()?.width || 1440) < 901) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Categories', exact: true }).click();
  }
  const added = page.getByRole('button', { name: 'Just Added', exact: true }).filter({ visible: true });
  await added.hover();
  await expect(added).toHaveCSS('background-color', 'rgb(18, 75, 73)');
  await expect(added).toHaveCSS('color', 'rgb(255, 255, 255)');
  await added.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(added).toBeFocused();
  await expect(added).toHaveCSS('outline-color', 'rgb(234, 201, 138)');
  await expect(added).toHaveCSS('outline-style', 'solid');
  await expect(added).toHaveCSS('outline-width', '2px');
});
