import { expect, test } from '@playwright/test';
import process from 'node:process';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';
import { searchProducts } from '../tests/fixtures/instore-search-products.mjs';

for (const count of [5000, 20000]) for (const cache of ['cold', 'warm']) {
  test(`${count} rows ${cache}: submit Main search then open all Instore matches`, async ({ page, context }, testInfo) => {
    test.setTimeout(90000);
    const rows = searchProducts(count).map(row => ({ ...row, stockQty: 20, stockOnHand: 20 }));
    const main = rows.map(row => ({ ...row, isExtendedRange: false }));
    const safety = await installAccessibilityServices(context, { products: main });
    // Model the endpoint contract: a batch SKU read returns only its batch,
    // and the homepage features a bounded selection. Returning the entire
    // catalogue once per SKU batch would create artificial quadratic payloads.
    await context.route('**/api/products*', route => {
      const skus = new URL(route.request().url()).searchParams.get('skus');
      const requested = skus ? new Set(skus.split(',')) : null;
      return route.fulfill({ json: requested ? main.filter(row => requested.has(row.sku)) : main });
    });
    await context.route('**/api/featured-products', route => route.fulfill({ json: { items: main.slice(0, 24).map(row => ({ sku: row.sku })) } }));
    const requests = [], pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    let releaseCatalogue;
    const gate = new Promise(resolve => { releaseCatalogue = resolve; });
    if (cache === 'warm') releaseCatalogue();
    await context.route('**/api/extended-range*', async route => {
      const url = new URL(route.request().url());
      const catalogue = url.searchParams.get('catalogue') === '1';
      requests.push({ catalogue, query: url.searchParams.get('q') || '' });
      if (catalogue) await gate;
      await new Promise(resolve => setTimeout(resolve, 80)); // fixed synthetic transport, not hosted latency
      const query = url.searchParams.get('q') || '';
      const filtered = query ? rows.filter(row => query === 'hair clips' ? row.name === 'HAIR CLIP PURPLE' : row.name === 'DRAWSTRING BRACELET ORANGE') : rows;
      await route.fulfill({ json: { products: filtered.slice(0, 24), total: filtered.length, page: 1, pageSize: 24,
        tiles: [], ...(catalogue ? { catalogue: rows } : {}) } }).catch(() => {});
    });
    await signInCatalogue(page);
    const servedMatcher = await page.evaluate(() => fetch('/src/lib/fuzzySearch.js').then(response => response.text()));
    expect(servedMatcher.includes('exactYearCode')).toBe(process.env.PROTO_BENCH_REVISION !== 'before');
    if (cache === 'warm') {
      // Warm means complete hydrated catalogue, not merely one cached page.
      await expect.poll(() => page.evaluate(async () => (await import('/src/lib/extendedRange.js')).instoreCatalogue()?.length || 0)).toBe(count);
    } else {
      expect(await page.evaluate(async () => (await import('/src/lib/extendedRange.js')).instoreCatalogue())).toBe(null);
    }
    const search = page.locator('[role=combobox][aria-label="Search by product name, SKU or barcode"]:visible');
    if ((page.viewportSize()?.width || 1440) < 901) await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
    const beforeRequests = requests.length;
    const started = Date.now();
    releaseCatalogue();
    await search.fill('hair clips');
    await search.press('Enter');
    const seeAll = page.getByRole('button', { name: /^See all .* Instore matches$/ });
    await expect(seeAll).toBeVisible();
    const mainResultsMs = Date.now() - started;
    const routeStarted = Date.now();
    await seeAll.click();
    await expect(page.locator('.instore-summary strong')).toContainText('hair clips');
    await expect(page.locator('.instore').getByRole('heading', { name: 'HAIR CLIP PURPLE', exact: true }).first()).toBeVisible();
    const routeMs = Date.now() - routeStarted;
    const sample = { revision: process.env.PROTO_BENCH_REVISION || 'after', viewport: testInfo.project.name,
      repeat: testInfo.repeatEachIndex, rows: count, cache, mainResultsMs, routeMs, totalMs: Date.now() - started,
      requestsDuringSearchAndTransition: requests.slice(beforeRequests), syntheticTransportMs: 80 };
    console.log(`TRANSITION_SAMPLE ${JSON.stringify(sample)}`);
    await testInfo.attach('transition-sample', { body: JSON.stringify(sample), contentType: 'application/json' });
    expect(routeMs).toBeLessThan(4000);
    expect(pageErrors).toEqual([]);
    expect(safety.blockedRequests).toEqual([]);
  });
}
