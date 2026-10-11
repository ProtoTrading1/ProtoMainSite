import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';
import { reportCases } from '../tests/fixtures/search-report-corpus.js';

const names = [...new Set(reportCases.map(([, name]) => name).filter(Boolean)), 'Gingerbread House', 'Sewing Set In Black Case'];
const rows = names.map((name, index) => ({
  id: `CORPUS-${index}`, sku: `CORPUS-${index}`, code: `CORPUS-${index}`, barcode: `650000${String(index).padStart(4, '0')}`,
  name, title: name, price: 100, stockOnHand: 10, stockQty: 10, inStock: true, minQty: 1, categoryPath: [],
}));

for (const scope of ['Main', 'Instore']) {
  test(`${scope} renders the complete original report wording corpus without unsupported fallback`, async ({ page, context }) => {
    test.setTimeout(90000);
    await installAccessibilityServices(context, { products: scope === 'Main' ? rows : [rows[0]] });
    await context.route('**/api/extended-range*', route => route.fulfill({ json: {
      products: scope === 'Instore' ? rows : [], catalogue: scope === 'Instore' ? rows : [],
      total: scope === 'Instore' ? rows.length : 0, page: 1, pageSize: 24, tiles: [],
    } }));
    await signInCatalogue(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const [query, expected] of reportCases) {
      if (scope === 'Main') await page.goto(`/#/?q=${encodeURIComponent(query)}`);
      else {
        if (!page.url().includes('/instore-products')) await page.goto('/#/instore-products');
        await page.locator('#instore-search').fill(query);
        await expect(page.locator('#instore-search')).toHaveValue(query);
        await page.locator('#instore-search').press('Enter');
        await expect.poll(() => new URLSearchParams(page.url().split('?')[1]).get('q')).toBe(query);
      }
      const grid = page.locator(scope === 'Main' ? '.catalog-page' : '.instore');
      if (expected) {
        await expect(grid.getByRole('button', { name: `View ${expected}`, exact: true })).toBeVisible();
      } else {
        await expect(grid.locator('.product-card')).toHaveCount(0);
        await expect(grid).toContainText(/No .*products|No .*matches|couldn.t find|nothing matched/i);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test('structured grouped searches render and add only the eligible variant', async ({ page, context }) => {
  const cheap = { ...rows[0], id: 'SAFE-CHEAP', sku: 'SAFE-CHEAP', barcode: 'SHARED-CHARGER', name: 'Charger White', title: 'Charger White', price: 25 };
  const expensive = { ...cheap, id: 'SAFE-EXPENSIVE', sku: 'SAFE-EXPENSIVE', name: 'Charger Black', title: 'Charger Black', price: 100, image: '/bag_black.png' };
  await installAccessibilityServices(context, { products: [cheap, expensive] });
  await signInCatalogue(page);
  await page.goto('/#/?q=charger+white+under+R30');
  const card = page.locator('.catalog-page .product-card').first();
  await expect(card).toContainText('Charger White');
  await expect(card).toContainText('R25.00');
  await expect(page.locator('.catalog-page')).not.toContainText('Charger Black');
  await card.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  const mobile = (page.viewportSize()?.width || 1440) < 901;
  await page.locator(mobile ? '[data-cart-trigger="mobile"]' : '.cart-summary').click();
  await expect(page.locator('[data-cart-product-id="SAFE-CHEAP"]:visible').first()).toBeVisible();
  await expect(page.locator('[data-cart-product-id="SAFE-EXPENSIVE"]')).toHaveCount(0);
});

test('Main pagination reverses correctly and a new query resets the result page', async ({ page, context }) => {
  const products = Array.from({ length: 65 }, (_, index) => ({ ...rows[0], id: `PAGE-${index}`, sku: `PAGE-${index}`, code: `PAGE-${index}`, barcode: `PAGE-${index}`, name: `Leather Bag ${String(index).padStart(3, '0')}`, title: `Leather Bag ${String(index).padStart(3, '0')}` }));
  await installAccessibilityServices(context, { products });
  await signInCatalogue(page);
  await page.goto('/#/?q=leather+bags');
  const grid = page.locator('.catalog-page');
  await expect(grid.locator('.product-card')).toHaveCount(60);
  await grid.getByRole('button', { name: /Next/ }).click();
  await expect(grid.locator('.product-card')).toHaveCount(5);
  await expect(grid.locator('.pagination-info')).toHaveText('Page 2 of 2');
  await grid.getByRole('button', { name: /Previous/ }).click();
  await expect(grid.locator('.product-card')).toHaveCount(60);
  await grid.getByRole('button', { name: /Next/ }).click();
  await page.goto('/#/?q=leather+bag+000');
  await expect(grid.locator('.product-card')).toHaveCount(1);
  await expect(grid).toContainText('Leather Bag 000');
});

for (const scope of ['Main', 'Instore']) {
  test(`${scope} excludes feather gift bags from leather searches while preserving exact feather searches`, async ({ page, context }) => {
    const products = [
      { ...rows[0], id: 'LEATHER', sku: 'LEATHER', barcode: 'LEATHER', code: 'LEATHER', name: 'Leather Bag', title: 'Leather Bag' },
      ...['8616500402', '8616500403'].map(sku => ({ ...rows[0], id: sku, sku, barcode: sku, code: sku, name: 'GIFT BAG FEATHER PRINT W/GLIT', title: 'GIFT BAG FEATHER PRINT W/GLIT' })),
    ];
    await installAccessibilityServices(context, { products: scope === 'Main' ? products : [rows[0]] });
    await context.route('**/api/extended-range*', route => route.fulfill({ json: {
      products: scope === 'Instore' ? products : [], catalogue: scope === 'Instore' ? products : [],
      total: scope === 'Instore' ? products.length : 0, page: 1, pageSize: 24, tiles: [],
    } }));
    await signInCatalogue(page);
    for (const query of ['Leather bag', 'Leather bags', 'bags leather', 'leathre bag', 'feather bags']) {
      await page.goto(`/#/${scope === 'Instore' ? 'instore-products' : ''}?q=${encodeURIComponent(query)}`);
      const grid = page.locator(scope === 'Main' ? '.catalog-page' : '.instore');
      if (query === 'feather bags') {
        await expect(grid.locator('.product-card')).toHaveCount(2);
        await expect(grid).not.toContainText('Leather Bag');
      } else {
        await expect(grid.locator('.product-card')).toHaveCount(1);
        await expect(grid.getByRole('button', { name: 'View Leather Bag', exact: true })).toBeVisible();
        await expect(grid).not.toContainText('FEATHER');
      }
    }
  });
}
