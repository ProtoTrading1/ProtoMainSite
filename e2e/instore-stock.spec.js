import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const clip = { id: '8610100223N', sku: '8610100223N', code: '8610100223N', name: 'METAL E/RING CLIP ON ±10PCS', title: 'METAL E/RING CLIP ON ±10PCS', price: 79.5, stockQty: 11, stockOnHand: 11, minQty: 1, isExtendedRange: true, imageSource: 'nutstore', availability: { state: 'in_stock', canOrder: true, label: 'In stock' } };
const checkedStock = (qty = 11) => ({ sku: clip.sku, qty, price: 79.5,
  unitsOfIssue: 'PACK 10', unitsOfIssueRaw: 'PKT,10', unitsOfIssueSource: 'positill_live', unitsOfIssueVerified: true,
  availability: { state: qty > 0 ? 'in_stock' : 'out_of_stock', canOrder: qty > 0, label: qty > 0 ? 'In stock' : 'Out of stock' } });

async function setup(context, { delayMs = 0, status = 200 } = {}) {
  await installAccessibilityServices(context, { products: catalogueProducts });
  await context.route('**/api/extended-range*', route => route.fulfill({ json: { products: [clip], catalogue: [clip], total: 1, page: 1, pageSize: 24, tiles: [] } }));
  await context.route('**/api/stock*', async route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const sku = new URL(route.request().url()).searchParams.get('sku');
    if (sku === clip.sku && delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    await route.fulfill({ status, json: status === 200 ? checkedStock(sku === clip.sku ? 11 : 100) : { error: 'Stock lookup failed' } });
  });
}

test('Instore preview accepts a fresh stock response that takes longer than ten seconds', async ({ page, context }, testInfo) => {
  await setup(context, { delayMs: 11000 });
  await signInCatalogue(page);
  await page.goto('/#/?q=clip+on');
  const result = page.locator('.catalog-instore-grid').getByRole('button', { name: `View ${clip.name}`, exact: true });
  await result.click();
  const stock = page.locator('.pz-stock-check');
  await expect(page.locator('.pz-modal').getByRole('button', { name: 'Add 1 to order', exact: true })).toBeDisabled();
  await expect(stock.getByText('In stock: 11')).toBeVisible({ timeout: 15000 });
  await expect(stock.getByText('Could not verify stock and selling unit', { exact: false })).toHaveCount(0);
  await expect(page.locator('.pz-modal').getByRole('button', { name: 'Add 1 to order', exact: true })).toBeEnabled();
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
  await expect(stock.getByText('Could not verify stock and selling unit', { exact: false })).toBeVisible();
  await expect(page.locator('.pz-modal').getByRole('button', { name: 'Add 1 to order', exact: true })).toBeDisabled();
  await context.route('**/api/stock*', route => route.fulfill({ json: checkedStock(0) }));
  await stock.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(stock.getByText('Out of stock', { exact: true })).toBeVisible();
  await expect(stock.getByText('In stock: 11')).toHaveCount(0);
  await expect(page.locator('.pz-modal').getByRole('button', { name: 'Add 1 to order', exact: true })).toBeDisabled();
});

test('Instore product-card stock checks also accept the slower fresh response', async ({ page, context }) => {
  await setup(context, { delayMs: 11000 });
  await signInCatalogue(page);
  await page.goto('/#/instore-products?q=clip+on');
  const card = page.locator('.instore-grid .product-card').first();
  await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  await card.getByRole('button', { name: 'Check stock and unit', exact: true }).click();
  await expect(card.getByText('In stock: 11')).toBeVisible({ timeout: 15000 });
  await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
});

test('a successful stock response without a verified Positill unit cannot enable ordering', async ({page,context}) => {
  await setup(context);
  await context.route('**/api/stock*',route=>route.fulfill({json:{qty:11,availability:{state:'in_stock',canOrder:true,label:'In stock'}}}));
  await signInCatalogue(page);
  await page.goto('/#/?q=clip+on');
  await page.locator('.catalog-instore-grid').getByRole('button',{name:`View ${clip.name}`,exact:true}).click();
  await expect(page.locator('.pz-stock-check').getByText('Could not verify stock and selling unit',{exact:false})).toBeVisible();
  await expect(page.locator('.pz-modal').getByRole('button',{name:'Add 1 to order',exact:true})).toBeDisabled();
});


test('a newer modal observation removes the card previous successful quantity', async ({page,context}) => {
  await setup(context);
  await signInCatalogue(page);
  await page.goto('/#/instore-products?q=clip+on');
  const card=page.locator('.instore-grid .product-card').first();
  await card.getByRole('button',{name:'Check stock and unit',exact:true}).click();
  await expect(card.getByText('In stock: 11')).toBeVisible();
  await context.route('**/api/stock*',route=>route.fulfill({json:checkedStock(0)}));
  await card.getByRole('button',{name:`View ${clip.name}`,exact:true}).click();
  await expect(page.locator('.pz-stock-check').getByText('Out of stock',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(card.getByText('In stock: 11')).toHaveCount(0);
  await expect(card.getByRole('button',{name:'Add to Cart',exact:true})).toBeDisabled();
});
