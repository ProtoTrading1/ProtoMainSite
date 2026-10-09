import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

// Synthetic responses only. Deliberately retain old cached/API copy so client
// presentation proves consistency without altering quantities or orderability.
const availability = { state: 'landed', label: 'Landed - being received', guidance: 'Available subject to confirmation', canOrder: true, stockQty: 0, incomingStatus: 'landed_awaiting_grv', incomingQty: 0.001, allowPreorder: false };
const product = { id: 'SR0002', code: '8611100002N', sku: 'SR0002', barcode: '8611100002N', name: 'SYNTHETIC SR0002 LABEL REVIEW', title: 'SYNTHETIC SR0002 LABEL REVIEW', image: '/bag_black.png', price: 1, stockQty: 0, stockOnHand: 0, keepLiveWhenOos: true, minQty: 1, unitsOfIssue: 'Each', ...availability, availability };

test('SR0002 cached badge and live result consistently say Stock available', async ({ page, context }, testInfo) => {
  await installAccessibilityServices(context, { products: [product] });
  await context.route('**/api/stock*', route => route.fulfill({ json: { qty: 0, availability } }));
  const errors=[]; page.on('pageerror', error => errors.push(error.message));
  await signInCatalogue(page);
  const card=page.locator('.product-card').first();
  await expect(card.locator('.pc-orderability > span')).toHaveText('Stock available');
  await expect(card.locator('.pc-orderability small')).toHaveText('Available subject to confirmation');
  await card.getByRole('button', { name: 'Check live stock', exact: true }).click();
  await expect(card.locator('.stock-readout')).toHaveText('Stock available');
  await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  await expect(card).not.toContainText('Landed - being received');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('stock-available-card.png'), animations: 'disabled' });
  await card.getByRole('button', { name: `View ${product.name}`, exact: true }).click();
  await expect(page.locator('.pz-to-order-note')).toHaveText('Stock available.');
  await page.locator('.pz-to-order-note').scrollIntoViewIfNeeded();
  await expect(page.locator('.pz-stock-check .stock-readout')).toHaveText('Stock available');
  await page.screenshot({ path: testInfo.outputPath('stock-available-detail.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
});
