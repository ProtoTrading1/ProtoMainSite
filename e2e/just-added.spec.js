import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const products = [
  { ...catalogueProducts[0], name: 'New blue notebook', title: 'New blue notebook', isNew: true, categoryPath: ['stationery'] },
  { ...catalogueProducts[1], name: 'Ordinary pink notebook', title: 'Ordinary pink notebook', isNew: false, categoryPath: ['stationery'] },
  { ...catalogueProducts[2], name: 'New unavailable pencils', title: 'New unavailable pencils', isNew: true, stockOnHand: 0, stockQty: 0, inStock: false, categoryPath: ['craft'] },
  { ...catalogueProducts[0], id: 'OLD-SIBLING', sku: 'OLD-SIBLING', name: 'Old blue notebook sibling', title: 'Old blue notebook sibling', isNew: false, categoryPath: ['stationery'] },
  { ...catalogueProducts[0], id: 'SPECIAL-ONLY', sku: 'SPECIAL-ONLY', code: 'SPECIAL-ONLY', barcode: 'SPECIAL-ONLY', name: 'Configured special only', title: 'Configured special only', isNew: false },
];

async function setup(context, page, { catalogue = products, featured, arrivalOrder, specials = [{ productId: 'SPECIAL-ONLY', specialPrice: 10 }], taxonomy = [{ id: 'stationery', label: 'Stationery', children: [] }, { id: 'craft', label: 'Craft', children: [] }] } = {}) {
  await installAccessibilityServices(context, { products: catalogue });
  await context.route('**/api/sort-orders', (route) => route.fulfill({ headers: { 'Cache-Control': 'no-store' }, contentType: 'application/json', body: JSON.stringify({ orders: { 'collection:just-added': { skuOrder: arrivalOrder || [], updatedAt: null } } }) }));
  if (featured) await context.route('**/api/featured-products', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: featured.map(({ sku }) => ({ sku })) }) }));
  await context.route('**/api/taxonomy', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ categories: taxonomy }) }));
  await context.route('**/api/products?identifier=*', (route) => {
    const query = new URL(route.request().url()).searchParams.get('identifier');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(catalogue.filter((row) => [row.sku, row.barcode].includes(query))) });
  });
  await context.route('**/api/specials', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: specials }) }));
  await signInCatalogue(page);
  const dismiss = page.getByRole('button', { name: 'Dismiss search tip' });
  if (await dismiss.isVisible()) await dismiss.click();
}

for (const scenario of [
  { name: 'arrival only', isNew: true, special: null, label: null },
  { name: 'configured discount only', isNew: false, special: { deal: 'discount', discountPct: 15 }, label: '15% OFF' },
  { name: 'arrival with configured deal', isNew: true, special: { deal: 'bogo', bogoX: 2, bogoY: 1 }, label: 'Buy 2 Get 1 Free' },
  { name: 'configured generic special', isNew: false, special: { deal: 'none' }, label: "This Week's Special" },
]) {
  test(`${scenario.name} uses only configured special labels in cards and previews`, async ({ page, context }) => {
    const product = { ...products[0], name: 'Label regression notebook', title: 'Label regression notebook', isNew: scenario.isNew, yearlySales: 10, categoryPath: ['stationery', 'notebooks'] };
    const specials = scenario.special ? [{ productId: product.id, ...scenario.special }] : [];
    await setup(context, page, { catalogue: [product], featured: [product], specials, taxonomy: [{ id: 'stationery', label: 'Stationery', children: [{ id: 'notebooks', label: 'Notebooks', children: [] }] }] });
    const card = page.locator('.product-card').filter({ hasText: product.name });
    await expect(card).toBeVisible();
    if (scenario.label) await expect(card.locator('.pc-special-ribbon')).toHaveText(scenario.label);
    else await expect(card.locator('.pc-special-ribbon')).toHaveCount(0);
    await card.getByRole('button', { name: `View ${product.name}`, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    if (scenario.label) await expect(dialog.locator('.pz-special-badge')).toHaveText(scenario.label);
    else await expect(dialog.locator('.pz-special-badge')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Category-strip previews use App's separate global preview path.
    await page.goto('/#/stationery');
    const strip = page.locator('.strip-card').filter({ hasText: product.name }).first();
    await expect(strip).toBeVisible();
    await strip.getByRole('button', { name: `View ${product.name}`, exact: true }).click();
    await expect(dialog).toBeVisible();
    if (scenario.label) await expect(dialog.locator('.pz-special-badge')).toHaveText(scenario.label);
    else await expect(dialog.locator('.pz-special-badge')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

async function selectCollection(page, name) {
  if ((page.viewportSize()?.width || 1440) < 901) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Categories', exact: true }).click();
    const menu = page.getByRole('dialog', { name: 'Browse categories' });
    const specials = menu.getByRole('button', { name: 'Specials', exact: true });
    const added = menu.getByRole('button', { name: 'Just Added', exact: true });
    await expect(added).toHaveCSS('background-color', /rgb\((15, 92, 89|18, 75, 73)\)/);
    await expect(added).toHaveCSS('color', 'rgb(255, 255, 255)');
    const left = await specials.boundingBox();
    const right = await added.boundingBox();
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    expect(right.x).toBeGreaterThan(left.x);
    await menu.getByRole('button', { name, exact: true }).click();
    await expect(menu).toHaveCount(0);
  } else {
    const nav = page.locator('.header-nav');
    const added = nav.getByRole('button', { name: 'Just Added', exact: true });
    await expect(added).toHaveCSS('background-color', /rgb\((15, 92, 89|18, 75, 73)\)/);
    await expect(added).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(nav.locator('button').filter({ hasText: 'Specials' }).locator('xpath=following-sibling::button[1]')).toHaveText('Just Added');
    await nav.getByRole('button', { name, exact: true }).click();
  }
}

test('Just Added uses curated flags; Specials uses configured entries; history and refresh restore scope', async ({ page, context }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(context, page);
  const grid = page.locator('.catalog-page');
  await selectCollection(page, 'Just Added');
  await expect(page).toHaveURL(/collection=just-added/);
  await expect(grid.getByRole('heading', { name: 'Just Added', exact: true })).toBeVisible();
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toBeVisible();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Old blue notebook sibling', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Configured special only', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('just-added.png'), fullPage: true });
  await selectCollection(page, 'Specials');
  await expect(grid.getByText('New blue notebook', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Configured special only', { exact: true })).toBeVisible();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(grid.getByRole('heading', { name: 'Just Added', exact: true })).toBeVisible();
  await page.goForward();
  await expect(grid.getByRole('heading', { name: "This Week's Specials", exact: true })).toBeVisible();
  await selectCollection(page, 'Just Added');
  await selectCollection(page, 'Just Added');
  await page.reload();
  await expect(grid.getByRole('heading', { name: 'Just Added', exact: true })).toBeVisible();
  await expect(grid.getByText('Configured special only', { exact: true })).toHaveCount(0);
  await grid.getByRole('button', { name: 'All products', exact: true }).click();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('search and clear retain Just Added; ordinary identifiers cannot bypass its flag; stock/cart eligibility remains intact', async ({ page, context }) => {
  await setup(context, page);
  await selectCollection(page, 'Just Added');
  const grid = page.locator('.catalog-page');
  const search = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' });
  const submit = async (query) => {
    if ((page.viewportSize()?.width || 1440) < 901 && !await search.isVisible()) {
      await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
    }
    await search.fill(query);
    await search.press('Enter');
  };
  await submit('notebook');
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Old blue notebook sibling', { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/collection=just-added/);
  await grid.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toBeVisible();
  const unavailable = grid.locator('.product-card').filter({ hasText: 'New unavailable pencils' });
  await expect(unavailable.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  const available = grid.locator('.product-card').filter({ hasText: 'New blue notebook' });
  await available.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(available.locator('input[type="number"]')).toHaveValue('1');
  await submit('E2E-1002');
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.locator('.product-card')).toHaveCount(0);
});

test('category filtering preserves Just Added scope and counts', async ({ page, context }) => {
  await setup(context, page);
  await selectCollection(page, 'Just Added');
  await page.goto('/#/stationery?collection=just-added');
  const grid = page.locator('.catalog-page');
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('Old blue notebook sibling', { exact: true })).toHaveCount(0);
  await expect(grid.locator('.product-card')).toHaveCount(1);
  await grid.getByRole('button', { name: 'All departments', exact: true }).click();
  await expect(page).toHaveURL(/collection=just-added/);
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toBeVisible();
});

test('Specials separates arrivals, retains explicitly configured overlap, and keeps counts/search scoped', async ({ page, context }) => {
  const both = { ...products[0], id: 'ARRIVAL-OFFER', sku: 'ARRIVAL-OFFER', code: 'ARRIVAL-OFFER', barcode: 'BOTH-1000', name: 'New offer notebook', title: 'New offer notebook', isNew: true };
  const sibling = { ...both, id: 'OFFER-SIBLING', sku: 'OFFER-SIBLING', code: 'OFFER-SIBLING', name: 'Unconfigured sibling', title: 'Unconfigured sibling', isNew: false };
  await setup(context, page, { catalogue: [...products, both, sibling], specials: [
    { productId: 'SPECIAL-ONLY', deal: 'discount', discountPct: 15 },
    { productId: both.id, deal: 'bogo', bogoX: 2, bogoY: 1 },
  ] });
  const grid = page.locator('.catalog-page');
  await selectCollection(page, 'Just Added');
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  await expect(grid.getByText(both.name, { exact: true })).toBeVisible();
  await expect(grid.getByText('Configured special only', { exact: true })).toHaveCount(0);
  await selectCollection(page, 'Specials');
  await expect(grid.locator('.product-card')).toHaveCount(2);
  await expect(grid.getByText(both.name, { exact: true })).toBeVisible();
  await expect(grid.getByText('Configured special only', { exact: true })).toBeVisible();
  await expect(grid.getByText('New blue notebook', { exact: true })).toHaveCount(0);
  await expect(grid.getByText('New unavailable pencils', { exact: true })).toHaveCount(0);
  const counts = await page.evaluate(async () => {
    const { fetchCategoryCounts } = await import('/src/lib/products.js');
    const read = async ids => (await fetchCategoryCounts({ collection: 'specials', specialIds: new Set(ids) }))[''];
    return [await read(['SPECIAL-ONLY']), await read(['SPECIAL-ONLY', 'ARRIVAL-OFFER']), await read(['SPECIAL-ONLY'])];
  });
  expect(counts).toEqual([1, 2, 1]);
  const search = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' });
  const submit = async query => {
    if ((page.viewportSize()?.width || 1440) < 901 && !await search.isVisible()) await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
    await search.fill(query); await search.press('Enter');
  };
  await submit('E2E-BLUE');
  await expect(grid.locator('.product-card')).toHaveCount(0);
  await submit('New offer notebook');
  await expect(grid.locator('.product-card')).toHaveCount(1);
  await expect(grid.getByText('Unconfigured sibling', { exact: true })).toHaveCount(0);
  await grid.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(grid.locator('.product-card')).toHaveCount(2);
  await page.reload();
  await expect(grid.locator('.product-card')).toHaveCount(2);
  await expect(page).toHaveURL(/collection=specials/);
});

test('empty configured Specials never substitutes arrival products', async ({ page, context }) => {
  await setup(context, page, { specials: [] });
  await selectCollection(page, 'Specials');
  await expect(page.locator('.catalog-page .product-card')).toHaveCount(0);
  await expect(page.locator('.catalog-page').getByRole('heading', { name: "This Week's Specials", exact: true })).toBeVisible();
  await selectCollection(page, 'Just Added');
  await expect(page.locator('.catalog-page').getByText('New blue notebook', { exact: true })).toBeVisible();
});

test('all curated arrivals remain reachable across pages independently of the featured home list', async ({ page, context }) => {
  const arrivals = Array.from({ length: 95 }, (_, index) => {
    const sku = `ARRIVAL-${String(index + 1).padStart(3, '0')}`;
    return { ...catalogueProducts[0], id: sku, sku, code: sku, barcode: sku, name: `New arrival ${String(index + 1).padStart(3, '0')}`, title: `New arrival ${String(index + 1).padStart(3, '0')}`, isNew: true };
  });
  const ordinary = products[1];
  await setup(context, page, { catalogue: [...arrivals, ordinary], featured: [ordinary] });
  const grid = page.locator('.catalog-page');
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toBeVisible();
  await selectCollection(page, 'Just Added');
  await expect(grid.locator('.product-card')).toHaveCount(60);
  const names = await grid.locator('.product-card h3').allTextContents();
  await grid.getByRole('button', { name: /Next/ }).click();
  await expect(grid.locator('.product-card')).toHaveCount(35);
  names.push(...await grid.locator('.product-card h3').allTextContents());
  expect(new Set(names).size).toBe(95);
  expect([...names].sort()).toEqual(arrivals.map(({ name }) => name).sort());
  await expect(grid.getByText('Ordinary pink notebook', { exact: true })).toHaveCount(0);
  await grid.getByRole('button', { name: /Previous/ }).click();
  await expect(grid.locator('.product-card')).toHaveCount(60);
});

test('published exact-SKU order ranks arrivals, appends unranked arrivals and respects customer sorting', async ({ page, context }) => {
  const arrivals = [
    { ...products[0], id: 'NEW-A', sku: 'NEW-A', barcode: 'NEW-A', name: 'Arrival A', title: 'Arrival A' },
    { ...products[0], id: 'NEW-B', sku: 'NEW-B', barcode: 'NEW-B', name: 'Arrival B', title: 'Arrival B' },
    { ...products[0], id: 'NEW-C', sku: 'NEW-C', barcode: 'NEW-C', name: 'Arrival C', title: 'Arrival C' },
  ];
  await setup(context, page, { catalogue: [...arrivals, products[1]], arrivalOrder: ['MISSING-SKU', products[1].id, 'NEW-C', 'NEW-A'] });
  await selectCollection(page, 'Just Added');
  const grid = page.locator('.catalog-page');
  const names = grid.locator('.product-card h3');
  await expect(names).toHaveText(['Arrival C', 'Arrival A', 'Arrival B']);
  await grid.locator('select').selectOption('name-asc');
  await expect(names).toHaveText(['Arrival A', 'Arrival B', 'Arrival C']);
  await grid.locator('select').selectOption('featured');
  await expect(names).toHaveText(['Arrival C', 'Arrival A', 'Arrival B']);
  await page.reload();
  await expect(names).toHaveText(['Arrival C', 'Arrival A', 'Arrival B']);
});

test('atomic outage shows a retryable Just Added error while Specials and category orders remain usable', async ({ page, context }) => {
  await setup(context, page);
  let unavailable = true;
  let reads = 0;
  await context.route('**/api/sort-orders', (route) => {
    reads += 1;
    return route.fulfill({ headers: { 'Cache-Control': 'no-store' }, contentType: 'application/json', body: JSON.stringify({ orders: { stationery: { skuOrder: [products[1].id, products[0].id] }, 'collection:just-added': unavailable ? { skuOrder: [], updatedAt: null, unavailable: true } : { skuOrder: [], updatedAt: 'order:recovered' } } }) });
  });
  await page.reload();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await selectCollection(page, 'Just Added');
  const grid = page.locator('.catalog-page');
  await expect(grid.getByRole('heading', { name: "We couldn't load Just Added." })).toBeVisible();
  await expect(grid.locator('.product-card')).toHaveCount(0);
  await expect(grid.getByRole('button', { name: 'Retry Just Added' })).toBeVisible();
  await selectCollection(page, 'Specials');
  await expect(grid.getByText('Configured special only', { exact: true })).toBeVisible();
  await page.goto('/#/stationery');
  await expect(grid.locator('.product-card h3').first()).toHaveText('Ordinary pink notebook');
  await selectCollection(page, 'Just Added');
  await expect(grid.getByRole('button', { name: 'Retry Just Added' })).toBeVisible();
  const beforeRetry = reads;
  unavailable = false;
  await grid.getByRole('button', { name: 'Retry Just Added' }).click();
  await expect(grid.getByText('New blue notebook', { exact: true })).toBeVisible();
  expect(reads).toBeGreaterThan(beforeRetry);
  await expect(grid.getByRole('alert')).toHaveCount(0);
});

test('healthy atomic order rechecks the network after the 15-second client TTL', async ({ page, context }) => {
  await setup(context, page);
  let reads = 0;
  await context.route('**/api/sort-orders', (route) => {
    reads += 1;
    return route.fulfill({ headers: { 'Cache-Control': 'no-store' }, contentType: 'application/json', body: JSON.stringify({ orders: { 'collection:just-added': { skuOrder: [], updatedAt: `order:${reads}` } } }) });
  });
  await page.reload();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await selectCollection(page, 'Just Added');
  const beforeExpiry = reads;
  await selectCollection(page, 'Specials');
  await page.waitForTimeout(15500);
  await selectCollection(page, 'Just Added');
  await expect.poll(() => reads).toBeGreaterThan(beforeExpiry);
  await expect(page.locator('.catalog-page').getByText('New blue notebook', { exact: true })).toBeVisible();
});

test('Just Added keeps white text on teal hover and visible keyboard focus', async ({ page, context }) => {
  await setup(context, page);
  if ((page.viewportSize()?.width || 1440) < 901) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Categories', exact: true }).click();
  }
  const added = page.getByRole('button', { name: 'Just Added', exact: true }).filter({ visible: true });
  await added.hover();
  await expect(added).toHaveCSS('background-color', 'rgb(18, 75, 73)');
  await expect(added).toHaveCSS('color', 'rgb(255, 255, 255)');
  await added.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(added).toBeFocused();
  await expect(added).toHaveCSS('outline-color', 'rgb(234, 201, 138)');
  await expect(added).toHaveCSS('outline-style', 'solid');
  await expect(added).toHaveCSS('outline-width', '2px');
});
