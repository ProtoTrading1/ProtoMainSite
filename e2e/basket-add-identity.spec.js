import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

for (const id of ['[OBJECT OBJECT]', { sku: 'VALID-SIBLING' }]) {
  test(`malformed ${typeof id} identity cannot add or show success`, async ({ page, context }) => {
    const product = { ...catalogueProducts[0], id, sku: 'VALID-SIBLING', code: 'ERP-SYNTHETIC', name: 'Synthetic identity review', title: 'Synthetic identity review' };
    await installAccessibilityServices(context, { products: [product] });
    const writes = [];
    const events = [];
    page.on('request', (request) => {
      if (request.method() !== 'POST' && request.method() !== 'PUT') return;
      if (request.url().endsWith('/api/account-cart')) writes.push(request.postDataJSON());
      if (/journey-analytics|shopping-events|search-analytics/.test(request.url())) events.push(request.postData() || '');
    });
    await signInCatalogue(page);
    await page.locator('.product-card').first().getByRole('button', { name: 'Add to Cart', exact: true }).click();
    const message = page.getByRole('status').filter({ hasText: 'This product option needs checking' });
    await expect(message).toBeAttached();
    // Open the actual product modal and exercise its separate success feedback.
    await page.locator('.product-card').first().locator('.product-image-wrapper, .product-image-container, .product-image').first().click();
    const add = page.getByRole('button', { name: 'Add 1 to order', exact: true });
    await expect(add).toBeVisible();
    await add.click();
    await expect(add).toHaveText('Add 1 to order');
    await expect(page.getByRole('button', { name: /Added 1/ })).toHaveCount(0);
    await page.waitForTimeout(1000); // Exceeds debounced account save, not a response-time assertion.
    expect(writes.filter((body) => body.mode === 'save')).toEqual([]);
    expect(events.some((body) => body.includes('cart_item_added'))).toBe(false);
  });
}

test('Instore rejection keeps the preference entry and does not show Added', async ({ page, context }) => {
  const product = { ...catalogueProducts[0], id: '[OBJECT OBJECT]', sku: 'VALID-SIBLING', code: 'VALID-SIBLING', isExtendedRange: true };
  await installAccessibilityServices(context, { products: [catalogueProducts[0]] });
  await context.route('**/api/extended-range**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ products: [product], catalogue: [product], total: 1, page: 1, pageSize: 24, tiles: [] }) }));
  await context.route('**/api/stock*', (route) => route.fulfill({ json: { sku: new URL(route.request().url()).searchParams.get('sku'), qty: 100, unitsOfIssue: 'EACH', unitsOfIssueRaw: 'EACH', unitsOfIssueSource: 'positill_live', unitsOfIssueVerified: true, availability: { state: 'in_stock', canOrder: true, label: 'In stock' } } }));
  await signInCatalogue(page);
  await page.goto('/#/instore-products');
  const card = page.locator('.instore-item').first();
  const preference = card.getByRole('textbox', { name: /Preferred colour/ });
  await preference.fill('Customer supplied preference');
  await card.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(preference).toHaveValue('Customer supplied preference');
  await card.locator('.product-image-wrapper, .product-image-container, .product-image').first().click();
  const add = page.getByRole('button', { name: 'Add 1 to order', exact: true });
  await add.click();
  await expect(add).toHaveText('Add 1 to order');
  await expect(page.getByRole('button', { name: /Added 1/ })).toHaveCount(0);
});
