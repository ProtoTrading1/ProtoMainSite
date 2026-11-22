import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';
import { mainNapkinProducts, instoreNapkinProducts, sharedNapkinBarcode } from '../tests/fixtures/instore-search-relevance.mjs';
import { fuzzyFilter } from '../src/lib/fuzzySearch.js';
import { prepareInstoreSearch } from '../lib/instore-discovery.mjs';

for (const scope of ['Main', 'Instore']) {
  test(`${scope} regional search, qualifiers and identifiers render in the existing customer journey`, async ({ page, context }) => {
    test.setTimeout(90000);
    const safety = await installAccessibilityServices(context, { products: mainNapkinProducts });
    await context.route('**/api/products*', route => {
      const identifier = new URL(route.request().url()).searchParams.get('identifier');
      return route.fulfill({ json: identifier ? fuzzyFilter(mainNapkinProducts, identifier) : mainNapkinProducts });
    });
    await context.route('**/api/extended-range*', route => {
      const query = new URL(route.request().url()).searchParams.get('q') || '';
      const search = prepareInstoreSearch(query);
      const products = instoreNapkinProducts.filter(search.matches).sort(search.compare);
      return route.fulfill({ json: { products, catalogue: instoreNapkinProducts, total: products.length, page: 1, pageSize: 24, tiles: [] } });
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await signInCatalogue(page);
    const grid = page.locator(scope === 'Main' ? '.catalog-page .product-grid' : '.instore');
    const view = name => grid.getByRole('button', { name: `View ${name}`, exact: true });
    for (const query of ['napkins christmas', 'serviettes christmas', 'christmas napkin', 'christmas serviette']) {
      await page.goto(`/#/${scope === 'Main' ? '' : 'instore-products'}?q=${encodeURIComponent(query)}`);
      await expect(view(scope === 'Main' ? 'Christmas Serviettes 20-Pack' : 'Christmas Serviettes In-store')).toBeVisible();
      await expect(view('Birthday Serviettes')).toHaveCount(0);
      await expect(view('Christmas Plates')).toHaveCount(0);
      await expect(view(scope === 'Main' ? 'Christmas Serviettes In-store' : 'Christmas Serviettes 20-Pack')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto(`/#/${scope === 'Main' ? '' : 'instore-products'}?q=${scope === 'Main' ? '8636-276005' : '8640000272'}`);
    await expect(view(scope === 'Main' ? 'Christmas Serviettes 20-Pack' : 'Christmas Serviettes In-store')).toBeVisible();
    await expect(grid.locator('.product-card, .instore-result-card')).toHaveCount(1);
    await page.goto(`/#/${scope === 'Main' ? '' : 'instore-products'}?q=napkins+halloween`);
    await expect(grid.locator('.product-card, .instore-result-card')).toHaveCount(0);
    if (scope === 'Main') {
      await page.goto(`/#/?q=${sharedNapkinBarcode}`);
      await expect(grid.locator('.product-card')).toHaveCount(1);
      await grid.getByRole('button', { name: /View Serviettes PACK100/ }).click();
      const options = page.getByRole('radiogroup', { name: 'Select a variant' });
      await expect(options.getByRole('radio')).toHaveCount(2);
      for (const suffix of ['RED', 'BLUE']) await expect(options.locator(`[data-variant-id="8201${suffix}"]`)).toBeVisible();
    }
    expect(errors).toEqual([]);
    expect(safety.blockedRequests).toEqual([]);
  });
}
