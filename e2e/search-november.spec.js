import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';
import { novemberProducts, novemberInstoreOnly } from '../tests/fixtures/search-november.mjs';

for (const scope of ['Main', 'Instore']) {
  test(`${scope} November wording and current channel evidence render on safe fixtures`, async ({ page, context }) => {
    test.setTimeout(90000);
    await installAccessibilityServices(context, { products: novemberProducts });
    const instore = [...novemberProducts, ...novemberInstoreOnly];
    await context.route('**/api/extended-range*', route => route.fulfill({ json: { products: instore, catalogue: instore, total: instore.length, page: 1, pageSize: 24, tiles: [] } }));
    await signInCatalogue(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cases = [['key rings', 'Metal Keyrings'], ['clip', 'Hair Clip'], ['squishies', 'Animal Squishy'], ['dia', 'Pocket Diary 2027'], ['incen', 'Stick Incense'], ['note book', 'Notebook A5'], ['xmas', 'Christmas Decoration'], ['journal', 'Journal'], ['2027', 'Pocket Diary 2027']];
    if (scope === 'Instore') cases.push(['crochet', 'Crochet Kit 78437'], ['table cloth', 'Tablecloth'], ['8640000272', 'Search-only In-store Item']);
    for (const [query, name] of cases) {
      await page.goto(`/#/${scope === 'Instore' ? 'instore-products' : ''}?q=${encodeURIComponent(query)}`);
      const grid = page.locator(scope === 'Main' ? '.catalog-page .product-grid' : '.instore');
      await expect(grid.getByRole('button', { name: `View ${name}`, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test('a recovery suggestion stays empty and logs one zero rather than a suggested hit', async ({ page, context }) => {
  await installAccessibilityServices(context, { products: novemberProducts.filter(p => p.sku === 'SUN') });
  const logs = [];
  await context.route('**/api/search-analytics', route => {
    const data = route.request().postDataJSON();
    if (data.action === 'log') logs.push(data);
    return route.fulfill({ json: { id: 'fixture-search' } });
  });
  await signInCatalogue(page);
  await page.goto('/#/?q=glasses');
  const grid = page.locator('.catalog-page');
  await expect(grid.getByText('Suggested searches (availability may vary):')).toBeVisible();
  await expect(grid.getByRole('link', { name: 'sunglasses', exact: true })).toBeVisible();
  await expect(grid.locator('.product-card')).toHaveCount(0);
  await expect.poll(() => logs.length).toBe(1);
  expect(logs[0].resultsFound).toBe(0);
  // Exercise a harmless rerender; a suggestion must not manufacture a search.
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(1200);
  expect(logs).toHaveLength(1);
});

test('fast code results and all four shared-barcode choices render without duplicate cards', async ({ page, context }) => {
  await installAccessibilityServices(context, { products: novemberProducts });
  // Explicit synthetic endpoint responses; server spelling/collision reads
  // are tested independently with the real fetchIdentifierRows helper.
  await context.route('**/api/products*', route => {
    const identifier = new URL(route.request().url()).searchParams.get('identifier');
    let products = novemberProducts;
    if (identifier === 'MP130-1' || identifier === 'mp1301') {
      products = ['MP130-1', 'mp1301'].map(sku => novemberProducts.find(p => p.sku === sku));
      products.sort((a, b) => Number(b.sku === identifier) - Number(a.sku === identifier));
    } else if (identifier) products = novemberProducts.filter(p => p.sku === identifier || p.barcode === identifier);
    return route.fulfill({ json: products });
  });
  await signInCatalogue(page);
  for (const [query, first] of [['MP130-1', 'MOTARRO STRETCH CANVAS'], ['mp1301', 'Identifier Collision'], ['MI07B', 'Model MI07B'], ['R21', 'Model R21'], ['R24', 'Model R24'], ['8616300009B', 'Variant Code']]) {
    await page.goto(`/#/?q=${encodeURIComponent(query)}`);
    await expect(page.locator('.catalog-page .product-grid .product-card').first()).toContainText(first);
  }
  await page.goto('/#/?q=8621100236');
  const grid = page.locator('.catalog-page .product-grid');
  await expect(grid.locator('.product-card')).toHaveCount(1);
  await grid.getByRole('button', { name: /View 2027 Diary/ }).click();
  const options = page.getByRole('radiogroup', { name: 'Select a variant' });
  await expect(options.getByRole('radio')).toHaveCount(4);
  for (const suffix of ['IVR', 'PEA', 'PNK', 'TUR']) await expect(options.locator(`[data-variant-id="FIX-${suffix}"]`)).toBeVisible();
});

test('a catalogue refresh during a pending log does not submit the same search twice', async ({ page, context }) => {
  await installAccessibilityServices(context, { products: novemberProducts.filter(p => p.sku === 'SUN') });
  let catalogue = novemberProducts.filter(p => p.sku === 'SUN');
  await context.route('**/api/products*', route => route.fulfill({ json: catalogue }));
  const logs = [];
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await context.route('**/api/search-analytics', async route => {
    const data = route.request().postDataJSON();
    if (data.action === 'log') { logs.push(data); await held; }
    await route.fulfill({ json: { id: 'fixture-delayed-search' } }).catch(() => {});
  });
  try {
    await signInCatalogue(page);
    await page.goto('/#/?q=glasses');
    await expect.poll(() => logs.length).toBe(1);
    catalogue = novemberProducts.filter(p => p.sku === 'GLASS');
    await page.evaluate(async () => (await import('/src/lib/products.js')).refreshProductCache({ maxAgeMs: 0 }));
    await expect(page.locator('.catalog-page .product-grid')).toContainText('Drinking Glasses');
    await page.waitForTimeout(1500);
    expect(logs).toHaveLength(1);
    expect(logs[0].resultsFound).toBe(0);
    release();
    await page.evaluate(async () => { location.hash = '#/'; await new Promise(resolve => setTimeout(resolve, 100)); });
    await page.evaluate(() => { location.hash = '#/?q=glasses'; });
    await expect.poll(() => logs.length).toBe(2);
    expect(logs[1].resultsFound).toBe(1);
  } finally { release(); }
});
