import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('turtle bracelet displays four colour preferences under one SKU', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], id: 'KBRA2013', sku: 'KBRA2013', code: 'KBRA2013', barcode: 'KBRA2013', name: 'BRACELET W/TURTLE', stockQty: 58, stockOnHand: 58, image: '/old-heart.jpg' };
  await installAccessibilityServices(context, { products: [product] });
  await signInCatalogue(page);
  const tip = page.getByRole('button', { name: 'Dismiss search tip' });
  if (await tip.isVisible()) await tip.click();
  const card = page.locator('.product-card').filter({ hasText: 'BRACELET W/TURTLE' });
  await expect(card).toHaveCount(1);
  const select = card.getByLabel('Preferred bracelet colour');
  await expect(select).toHaveValue('Brown');
  await expect(select.locator('option')).toHaveText(['Brown', 'Black', 'Turquoise', 'White']);
  await expect(card.locator('img').first()).toHaveAttribute('src', /2013brn\.jpg/);
  for (const [colour, suffix] of [['Black', 'blk'], ['Turquoise', 'tur'], ['White', 'whi']]) {
    await select.selectOption(colour);
    await expect(card.locator('img').first()).toHaveAttribute('src', new RegExp(`2013${suffix}\\.jpg`));
  }
  await card.getByRole('button', { name: /view bracelet w\/turtle/i }).click();
  const dialog = page.getByRole('dialog', { name: /bracelet w\/turtle/i });
  await expect(dialog.getByLabel('Preferred bracelet colour')).toHaveValue('White');
  await expect(dialog.locator('.pz-main-image-img')).toHaveAttribute('src', /2013whi\.jpg/);
  await dialog.getByLabel('Preferred bracelet colour').selectOption('Black');
  await expect(dialog.locator('.pz-main-image-img')).toHaveAttribute('src', /2013blk\.jpg/);
  await dialog.getByRole('button', { name: /add 1 to order/i }).click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await card.getByRole('button', { name: /add to cart/i }).click();
  const cartName = (page.viewportSize()?.width || 1440) < 901 ? /^cart 2$/i : /open cart\. 2 items/i;
  await page.getByRole('button', { name: cartName }).click();
  await expect(page.getByText(/White/).last()).toBeVisible();
  await expect(page.getByText(/Black/).last()).toBeVisible();
});

test('Instore carries the selected colour to the same product in the basket', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], id: 'KBRA2013', sku: 'KBRA2013', code: 'KBRA2013', barcode: 'KBRA2013', name: 'BRACELET W/TURTLE', stockQty: 58, stockOnHand: 58, isExtendedRange: true, availability: { state: 'in_stock', canOrder: true, label: 'In stock' } };
  await installAccessibilityServices(context);
  await context.route('**/api/extended-range*', route => route.fulfill({ json: { products: [product], catalogue: [product], total: 1, page: 1, pageSize: 24, tiles: [] } }));
  await context.route('**/api/stock*', route => route.fulfill({ json: { sku: product.sku, qty: 58, price: product.price, unitsOfIssue: 'EACH', unitsOfIssueRaw: 'EACH', unitsOfIssueSource: 'positill_live', unitsOfIssueVerified: true, availability: product.availability } }));
  await signInCatalogue(page);
  await page.goto('/#/instore-products?q=KBRA2013');
  const card = page.locator('.instore-grid .product-card').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText('Minimum 1 · Each')).toBeVisible();
  await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await card.getByLabel('Preferred bracelet colour').selectOption('Turquoise');
  await card.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.getByText(/Turquoise/).last()).toBeVisible();
});

test('an exact SKU link opens the brown image and all four preferences after refresh', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], id: 'KBRA2013', sku: 'KBRA2013', code: 'KBRA2013', barcode: 'KBRA2013', name: 'BRACELET W/TURTLE', stockQty: 58, stockOnHand: 58 };
  await installAccessibilityServices(context, { products: [product] });
  await signInCatalogue(page);
  await page.goto('/#/?q=KBRA2013&product=KBRA2013');
  const dialog = page.getByRole('dialog', { name: /bracelet w\/turtle/i });
  await expect(dialog.getByLabel('Preferred bracelet colour')).toHaveValue('Brown');
  await expect(dialog.locator('.pz-main-image-img')).toHaveAttribute('src', /2013brn\.jpg/);
  await page.reload();
  await expect(dialog.getByLabel('Preferred bracelet colour').locator('option')).toHaveCount(4);
  await expect(dialog.locator('.pz-main-image-img')).toHaveAttribute('src', /2013brn\.jpg/);
});

