import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import process from 'node:process';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000209';
const TEST_EMAIL = 'search-navigation-e2e@example.invalid';
const TEST_PASSWORD = 'SyntheticOnly123!';
const LOCAL_ORIGIN = `http://127.0.0.1:${Number(process.env.PROTO_PLAYWRIGHT_PORT || 4173)}`;

function product(index, name = `Soft toys pagination token item ${String(index + 1).padStart(2, '0')}`) {
  const id = `E2E-SEARCH-${String(index + 1).padStart(3, '0')}`;
  return {
    id, sku: id, code: id, name, title: name, price: 12.5,
    stockOnHand: 50, stockQty: 50, inStock: true, minQty: 1,
    categoryLabel: 'Synthetic Search', categoryPath: [],
  };
}

const instoreProducts = Array.from({ length: 53 }, (_, index) => product(index));
const catalogueProducts = [
  product(100, 'Amber synthetic result'),
  product(101, 'Cobalt synthetic result'),
  product(102, 'Unrelated synthetic catalogue item'),
];

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function tokenFor(user) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`;
}

async function installSyntheticServices(context, { delayedCatalogueResponse, taxonomy = [], catalogue = catalogueProducts } = {}) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    // Session revalidation must use the same synthetic identity as sign-in.
    // Letting this request fall through to Vite can intermittently sign out
    // the fixture while the first authenticated page is mounting.
    if (pathname.endsWith('/mock-supabase/auth/v1/user')) {
      return json(route, { id: ACCOUNT_ID, email: TEST_EMAIL, role: 'authenticated', aud: 'authenticated' });
    }

    if (pathname.endsWith('/mock-supabase/auth/v1/token')) {
      const user = { id: ACCOUNT_ID, email: TEST_EMAIL, role: 'authenticated', aud: 'authenticated' };
      return json(route, {
        access_token: tokenFor(user), token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'synthetic-refresh-token', user,
      });
    }

    // Keep the browser hermetic: only the local Vite app and intercepted mock
    // services may be reached. Remote fonts, images, analytics and APIs fail closed.
    if (url.origin !== LOCAL_ORIGIN) return route.abort();
    if (!pathname.startsWith('/api/')) return route.continue();

    if (pathname === '/api/extended-range') {
      const includeCatalogue = url.searchParams.get('catalogue') === '1';
      const query = url.searchParams.get('q') || '';
      const page = Number(url.searchParams.get('page') || 1);
      if (query.toLowerCase() === 'cobalt' && delayedCatalogueResponse) {
        delayedCatalogueResponse.started?.();
        await new Promise((resolve) => { delayedCatalogueResponse.resolve = resolve; });
      }
      const rows = query ? instoreProducts : instoreProducts;
      const start = (page - 1) * 24;
      return json(route, {
        products: rows.slice(start, start + 24), total: rows.length, page, pageSize: 24,
        ...(includeCatalogue && !delayedCatalogueResponse ? { catalogue: rows } : {}), tiles: [],
      });
    }
    if (pathname === '/api/products') {
      return json(route, catalogue);
    }
    if (pathname === '/api/featured-products') return json(route, { items: catalogueProducts.map(({ sku }) => ({ sku })) });
    if (pathname === '/api/customer-profile') {
      return json(route, { profile: { id: ACCOUNT_ID, email: TEST_EMAIL, name: 'Synthetic Search Customer', role: 'customer', is_approved: true } });
    }
    if (pathname === '/api/account-cart') return json(route, { items: [], activityAt: null, revision: 1 });
    if (pathname === '/api/taxonomy') return json(route, { categories: taxonomy });
    if (pathname === '/api/stock') return json(route, { qty: 50, to_order: false });
    if (pathname === '/api/specials') return json(route, { specials: [] });
    if (pathname === '/api/banner' || pathname === '/api/popup-special') return json(route, null);
    if (pathname === '/api/sort-orders') return json(route, {});
    // Explicitly prevent any unmodelled mutation endpoint from having effects.
    return json(route, { error: 'Blocked by synthetic search test' }, 503);
  });
}

async function signIn(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill(TEST_EMAIL);
  await dialog.locator('input[type="password"]').fill(TEST_PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  if ((page.viewportSize()?.width || 1440) < 901) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Search', exact: true }).click();
  }
  await expect(page.locator('input[aria-label="Search by product name, SKU or barcode"]:visible').first()).toBeVisible();
}

async function openInstore(page) {
  await page.locator('.sidebar-rail').getByRole('button', { name: 'Instore Products', exact: true }).click();
  await expect(page.locator('.instore h1')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '53 products' })).toBeVisible();
}

test('Instore pagination advances and reverses URL/page/results, and restores page 2 from the route', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installSyntheticServices(context);
  const page = await context.newPage();

  try {
    await signIn(page);
    await openInstore(page);

    await page.locator('#instore-search').fill('soft toys');
    await page.locator('.instore-search').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/#\/instore-products\?q=soft\+toys$/);
    await expect(page.getByRole('status').filter({ hasText: '53 products for “soft toys”' })).toBeVisible();

    const pagination = page.getByRole('navigation', { name: 'Product pages' });
    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/instore-products\?q=soft\+toys&page=2$/);
    await expect(pagination.getByText('Page 2 of 3')).toBeVisible();
    await expect(page.getByText('Soft toys pagination token item 25', { exact: true })).toBeVisible();
    await expect(page.getByText('Soft toys pagination token item 01', { exact: true })).toHaveCount(0);

    await pagination.getByRole('button', { name: 'Previous' }).click();
    await expect(page).toHaveURL(/#\/instore-products\?q=soft\+toys$/);
    await expect(pagination.getByText('Page 1 of 3')).toBeVisible();
    await expect(page.getByText('Soft toys pagination token item 01', { exact: true })).toBeVisible();

    await pagination.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/instore-products\?q=soft\+toys&page=2$/);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Product pages' }).getByText('Page 2 of 3')).toBeVisible();
    await expect(page.getByText('Soft toys pagination token item 25', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('a new catalogue query hides prior-query results while its Instore response is pending', async ({ browser }) => {
  let markStarted;
  const delay = {
    resolve: null,
    started: () => markStarted?.(),
  };
  const responseStarted = new Promise((resolve) => { markStarted = resolve; });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installSyntheticServices(context, { delayedCatalogueResponse: delay });
  const page = await context.newPage();

  try {
    await signIn(page);
    const search = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' });
    await search.fill('amber');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('Amber synthetic result', { exact: true })).toBeVisible();

    // Force the next catalogue response to remain unresolved during the query
    // transition, then inspect the visible result set before releasing it.
    await search.fill('cobalt');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=cobalt/);
    await responseStarted;
    await expect(page.getByText('Amber synthetic result', { exact: true })).toHaveCount(0);
    await expect(page.locator('.catalog-page > [role="status"]')).toHaveText('Searching products…');
    await expect(page.locator('.catalog-instore-heading')).toContainText('Searching Instore…');
    await expect(page.locator('.catalog-instore-heading')).not.toContainText('0 additional');
    delay.resolve?.();
    await expect(page.getByText('Cobalt synthetic result', { exact: true })).toBeVisible();
  } finally {
    delay.resolve?.();
    await context.close();
  }
});

test('catalogue search remains visible and usable at 1024px', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  await installSyntheticServices(context);
  const page = await context.newPage();

  try {
    await signIn(page);
    const search = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' });
    await expect(search).toBeVisible();
    await expect(search).toBeInViewport();
    await search.fill('amber');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/q=amber/);
    await expect(page.getByText('Amber synthetic result', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('every Instore search image opens its matching preview without leaving the search or changing the basket', async ({ page, context }) => {
  await installSyntheticServices(context);
  await signIn(page);
  const search = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' });
  await search.fill('soft toys');
  await search.press('Enter');
  const results = page.locator('.catalog-instore-grid');
  const images = results.getByRole('button', { name: /^View / });
  await expect(images.first()).toBeVisible();
  const count = await images.count();
  expect(count).toBeGreaterThan(1);
  const searchUrl = page.url();
  const basket = (page.viewportSize()?.width || 1440) < 901
    ? page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('button', { name: 'Cart', exact: true })
    : page.getByRole('button', { name: /^Open cart\./ }).first();
  const basketText = await basket.textContent();
  for (let index = 0; index < count; index += 1) {
    const name = (await images.nth(index).getAttribute('aria-label')).replace(/^View /, '');
    if (index % 2) {
      await images.nth(index).focus();
      await images.nth(index).press('Enter');
    } else {
      await images.nth(index).click();
    }
    await expect(page.getByRole('heading', { name, exact: true, level: 2 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await expect(page).toHaveURL(searchUrl);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true, level: 2 })).toHaveCount(0);
    await expect(basket).toHaveText(basketText);
  }
  await images.first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(searchUrl);
});

test('quick search offers live categories for typo families without broad qualifier matches', async ({ page, context }) => {
  await installSyntheticServices(context, { taxonomy: [
    { id: 'synthetic-toys', label: 'Synthetic Toys', children: [{ id: 'soft-toys', label: 'Soft Toys' }] },
    { id: 'synthetic-stationery', label: 'Stationery', children: [{ id: 'notebooks', label: 'Notebooks' }] },
  ] });
  await signIn(page);
  const search = page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' });
  await search.fill('sotf toys');
  const panel = page.locator('.header-search-dropdown:visible, .mobile-search-results:visible').first();
  await expect(panel.getByText('Browse categories', { exact: true })).toBeVisible();
  await expect(panel.getByRole('option', { name: /^Soft Toys\b/ })).toBeVisible();
  await search.fill('plush pen');
  await expect(panel.getByRole('option', { name: /^Soft Toys\b/ })).toHaveCount(0);
  await expect(panel).toContainText('No quick matches');
  await expect(panel.getByRole('button', { name: 'Search all products', exact: true })).toBeVisible();
  await search.fill('notepads');
  await expect(panel.getByRole('option', { name: /^Notebooks\b/ })).toBeVisible();
});

test('quick search names wrap and phone actions have usable touch targets', async ({ page, context }) => {
  const name = 'Amber synthetic extra long product description with colour size and variant details that must remain readable';
  await installSyntheticServices(context, { catalogue: [product(100, name)] });
  await signIn(page);
  await page.getByRole('combobox', { name: 'Search by product name, SKU or barcode' }).fill('amber');
  const panel = page.locator('.header-search-dropdown:visible, .mobile-search-results:visible').first();
  await expect(panel.getByText(name, { exact: true })).toBeVisible();
  const text = panel.locator('.sp-product-name').first();
  expect(await text.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('normal');
  const add = panel.getByRole('button', { name: `Add ${name} to order` });
  const bounds = await add.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
