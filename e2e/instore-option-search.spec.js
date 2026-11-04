import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';
import { SARONGI_GALLERIES } from '../lib/sarongi-instore-gallery-data.mjs';

for (const scope of ['website', 'Instore']) {
  test(`${scope} search finds reviewed colours in an older cached listing`, async ({ page, context }) => {
    const title = 'BRACELET DRAWSTRING 4PC';
    const product = { ...catalogueProducts[0], id: 'KBRA3014', sku: 'KBRA3014', code: 'KBRA3014',
      barcode: 'KBRA3014', name: title, title, originalDescription: title, description: title,
      image: `https://www.proto.co.za${SARONGI_GALLERIES.KBRA3014[0].path}`, price: 27.5,
      stockQty: 9, stockOnHand: 9, isExtendedRange: true,
      availability: { state: 'in_stock', canOrder: true, label: 'In stock' } };
    await installAccessibilityServices(context);
    await context.route('**/api/extended-range*', route => route.fulfill({ json: {
      products: [product], catalogue: [product], total: 1, page: 1, pageSize: 24, tiles: [],
    } }));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await signInCatalogue(page);
    for (const [query, match] of [
      ['purple drawstring bracelet', true], ['turquoise drawstring bracelet', true], ['KBRA3014', true],
      ['white drawstring bracelet', false], ['sarongi', false], ['KBRA3015', false],
    ]) {
      await page.goto(`/#/${scope === 'Instore' ? 'instore-products' : ''}?q=${encodeURIComponent(query)}`);
      const card = page.getByRole('button', { name: `View ${title}`, exact: true });
      if (match) {
        await expect(card).toBeVisible();
        await expect(page.getByText('R27.50', { exact: true }).first()).toBeVisible();
      } else await expect(card).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}
