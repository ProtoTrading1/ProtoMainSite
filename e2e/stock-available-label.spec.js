import { fulfillStockFixture } from './helpers/live-stock-fixture.js';
import { expect, test } from '@playwright/test';
import { resolveProductAvailability } from '../lib/product-availability.mjs';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

// Synthetic responses only. Deliberately retain old cached/API copy so client
// presentation proves consistency without altering source quantities.
const availability = { state: 'landed', label: 'Landed - being received', guidance: 'Available subject to confirmation', canOrder: true, stockQty: 0, incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001, allowPreorder: false };
const product = { id: 'SR0002', code: '8611100002N', sku: 'SR0002', barcode: '8611100002N', name: 'SYNTHETIC SR0002 LABEL REVIEW', title: 'SYNTHETIC SR0002 LABEL REVIEW', image: '/bag_black.png', price: 1, stockQty: 0, stockOnHand: 0, keepLiveWhenOos: true, minQty: 1, unitsOfIssue: 'Each', ...availability, availability };

test('DIRT TRUCK shows Stock available with an enabled cart button and real stock count', async ({ page, context }) => {
  const sku = 'MKTI562787';
  const qty = 12;
  const stock = resolveProductAvailability({ stockQty: qty });
  const truck = {
    ...product, id: sku, code: sku, sku, barcode: sku, name: 'DIRT TRUCK', title: 'DIRT TRUCK',
    stockQty: qty, stockOnHand: qty, availability: stock,
  };
  await installAccessibilityServices(context, { products: [truck] });
  await context.route('**/api/stock*', route => fulfillStockFixture(route, { qty, availability: stock }));
  await signInCatalogue(page);

  const card = page.locator('.product-card').first();
  await expect(card.locator('.pc-orderability > span')).toHaveText('Stock available');
  await expect(card).not.toContainText('Available subject to confirmation');
  await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await card.getByRole('button', { name: 'Check live stock', exact: true }).click();
  await expect(card.locator('.stock-result')).toContainText('Live stock: 12');
});

test('SR0002 cached badge and live result consistently say Stock available', async ({ page, context }, testInfo) => {
  await installAccessibilityServices(context, { products: [product] });
  await context.route('**/api/stock*', route => fulfillStockFixture(route, { qty: 0, availability }));
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await signInCatalogue(page);
  const card=page.locator('.product-card').first();
  await expect(card.locator('.pc-orderability > span')).toHaveText('Stock available');
  await expect(card.locator('.pc-orderability small')).toHaveText('Available subject to confirmation');
  await card.getByRole('button', { name: 'Check live stock', exact: true }).click();
  await expect(card.locator('.stock-result')).toContainText('Live stock: 0');
  await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await expect(card).not.toContainText('Landed - being received');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('stock-available-card.png'), animations: 'disabled' });
  await card.getByRole('button', { name: `View ${product.name}`, exact: true }).click();
  await expect(page.locator('.pz-to-order-note')).toHaveText('Stock available.');
  await page.locator('.pz-to-order-note').scrollIntoViewIfNeeded();
  await expect(page.locator('.pz-stock-check .stock-result')).toContainText('Live stock: 0');
  await page.screenshot({ path: testInfo.outputPath('stock-available-detail.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});

for (const [sku, name, stockQty] of [
  ['MKT3551328', 'SYNTHETIC TRACTOR', -1],
  ['MKT645585', 'DOLL DREAMS GIRL W/ACCESSORIES', 0],
  ['MKW657957', 'SPEED BOAT BATTERY OPERATED', -1],
]) {
  test(`received Showroom item ${sku} keeps its orderable badge without the extra guidance`, async ({ page, context }) => {
    const stock = { ...availability, stockQty };
    const received = {
      ...product, id: sku, code: sku, sku, barcode: sku, name, title: name,
      stockQty, stockOnHand: stockQty, availability: stock,
    };
    await installAccessibilityServices(context, { products: [received] });
    await context.route('**/api/stock*', route => fulfillStockFixture(route, { qty: stockQty, availability: stock }));
    await signInCatalogue(page);

    const card = page.locator('.product-card').first();
    await expect(card.locator('.pc-orderability > span')).toHaveText('Stock available');
    await expect(card).not.toContainText('Available subject to confirmation');
    await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
    await card.getByRole('button', { name: 'Check live stock', exact: true }).click();
    await expect(card.locator('.stock-result')).toContainText('Live stock: 0');
  });
}
