import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const clip = { id: '8610100223N', sku: '8610100223N', code: '8610100223N', name: 'METAL E/RING CLIP ON ±10PCS', title: 'METAL E/RING CLIP ON ±10PCS', price: 79.5, stockQty: 11, stockOnHand: 11, minQty: 1, isExtendedRange: true, imageSource: 'nutstore', availability: { state: 'in_stock', canOrder: true, label: 'In stock' } };

async function setup(context, { delayMs = 0, status = 200 } = {}) {
  await installAccessibilityServices(context, { products: catalogueProducts });
  await context.route('**/api/extended-range*', route => route.fulfill({ json: { products: [clip], catalogue: [clip], total: 1, page: 1, pageSize: 24, tiles: [] } }));
  await context.route('**/api/stock*', async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const sku = new URL(route.request().url()).searchParams.get('sku');
    if (sku === clip.sku && delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.fulfill({ status, json: status === 200 ? { qty: sku === clip.sku ? 11 : 100, availability: { state: 'in_stock', canOrder: true, label: 'In stock' } } : { error: 'Stock lookup failed' } });
  });
}

test('Instore preview accepts a fresh stock response that takes longer than ten seconds', async ({ page, context }, testInfo) => {
  await setup(context, { delayMs: 11000 });
  await signInCatalogue(page);
  await page.goto('/#/?q=clip+on');
  const result = page.locator('.catalog-instore-grid').getByRole('button', { name: `View ${clip.name}`, exact: true });
  await result.click();
  const stock = page.locator('.pz-stock-check');
  await expect(stock.getByText('In stock: 11')).toBeVisible({ timeout: 15000 });
  await expect(stock.getByText('Could not check stock', { exact: false })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('instore-stock-confirmed.png') });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL(/q=clip\+on$/);
});

test('failed Instore stock checks remain errors and retry uses a fresh response', async ({ page, context }) => {
  await setup(context, { status: 502 });
  await signInCatalogue(page);
  await page.goto('/#/?q=clip+on');
  await page.locator('.catalog-instore-grid').getByRole('button', { name: `View ${clip.name}`, exact: true }).click();
  const stock = page.locator('.pz-stock-check');
  await expect(stock.getByText('Could not check stock', { exact: false })).toBeVisible();
  await context.route('**/api/stock*', route => route.fulfill({ json: { qty: 0, availability: { state: 'out_of_stock', canOrder: false, label: 'Out of stock' } } }));
  await stock.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(stock.getByText('Out of stock', { exact: true })).toBeVisible();
  await expect(stock.getByText('In stock: 11')).toHaveCount(0);
});

test('Instore product-card stock checks also accept the slower fresh response', async ({ page, context }) => {
  await setup(context, { delayMs: 11000 });
  await signInCatalogue(page);
  await page.goto('/#/instore-products?q=clip+on');
  const card = page.locator('.instore-grid .product-card').first();
  await card.getByRole('button', { name: 'Check live stock', exact: true }).click();
  await expect(card.getByText('In stock: 11')).toBeVisible({ timeout: 15000 });
});
