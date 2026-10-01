import { test, expect } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const tip = (page) => page.getByRole('region', { name: 'Find more with Proto search' });
async function start(page, context) {
  await installAccessibilityServices(context);
  await page.clock.install();
  await signInCatalogue(page);
  await expect(page.locator('.customer-journey-prompt').first()).toBeVisible();
  // The existing welcome remains intact and expires before search guidance.
  await page.clock.fastForward(6000);
  await expect(tip(page)).toBeVisible();
}

test('one matching search tip and one four-minute reminder, even after refresh', async ({ page, context }) => {
  await start(page, context);
  await expect(tip(page)).toContainText('Search by product name, SKU or barcode, including Instore products.');
  await expect(tip(page)).toContainText('Click a product image for a closer look.');
  await page.clock.runFor(350);
  await page.screenshot({ path: `../search-tip-${test.info().project.name}.png`, animations: 'disabled' });
  const box = await tip(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  const header = await page.locator('.app-header').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
  const grid = await page.locator('.product-grid').boundingBox();
  expect(Math.abs(box.x - grid.x)).toBeLessThan(2);
  await page.clock.fastForward(13000);
  await expect(tip(page)).toHaveCount(0);
  await page.clock.fastForward(200000);
  await expect(tip(page)).toHaveCount(0);
  await page.clock.fastForward(25000);
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toContainText('SEARCH TIP');
  await page.clock.fastForward(13000);
  await expect(tip(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await page.clock.fastForward(300000);
  await expect(tip(page)).toHaveCount(0);
});

test('basket use prevents a reminder without changing its contents', async ({ page, context }) => {
  await start(page, context);
  const cart = page.locator('[data-cart-trigger]').filter({ visible: true });
  await cart.click();
  await expect(tip(page)).toHaveCount(0);
  await page.clock.fastForward(300000);
  await expect(tip(page)).toHaveCount(0);
  await expect(page.locator('.cart-item')).toHaveCount(0);
});

test('a reminder waits until an unrelated dialog closes', async ({ page, context }) => {
  test.skip(test.info().project.name.includes('mobile'), 'About Us is a desktop navigation control.');
  await start(page, context);
  await page.clock.fastForward(13000);
  await page.getByRole('button', { name: 'About Us', exact: true }).click();
  await page.clock.fastForward(300000);
  await expect(tip(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(tip(page)).toBeVisible();
  await expect(tip(page)).toContainText('SEARCH TIP');
});

test('dismissal prevents reminders and survives a new browser visit', async ({ page, context }) => {
  await start(page, context);
  await tip(page).getByRole('button', { name: 'Dismiss search tip' }).click();
  await page.clock.fastForward(300000);
  await expect(tip(page)).toHaveCount(0);
  await page.evaluate(() => sessionStorage.removeItem('proto_search_tip_visit_v1:00000000-0000-4000-8000-000000000210'));
  await page.reload();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await page.clock.fastForward(300000);
  await expect(tip(page)).toHaveCount(0);
});

test('Try search focuses the correct desktop or mobile input and cancels reminders', async ({ page, context }) => {
  await start(page, context);
  await tip(page).getByRole('button', { name: 'Try search' }).click();
  const input = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' }).filter({ visible: true });
  await expect(input).toBeFocused();
  await page.clock.fastForward(300000);
  await expect(tip(page)).toHaveCount(0);
});

test('using search suppresses reminders even after clearing the query', async ({ page, context }) => {
  await start(page, context);
  if (test.info().project.name.includes('mobile')) await page.getByRole('button', { name: 'Search', exact: true }).first().click();
  const input = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' }).filter({ visible: true });
  await input.fill('craft');
  await input.press('Enter');
  await expect(tip(page)).toHaveCount(0);
  await page.clock.fastForward(300000);
  await expect(tip(page)).toHaveCount(0);
});

test('opening a product or using the basket cancels reminders', async ({ page, context }) => {
  await start(page, context);
  await page.locator('.product-card').first().getByRole('button', { name: /^View / }).click();
  await expect(page.locator('.pz-modal')).toBeVisible();
  await expect(tip(page)).toHaveCount(0);
  await page.clock.fastForward(300000);
  await expect(tip(page)).toHaveCount(0);
});
