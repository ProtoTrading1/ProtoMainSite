import { expect, test } from '@playwright/test';
import {
  catalogueProducts, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue,
} from './helpers/accessibility-services.js';

test.use({ serviceWorkers: 'block' });

const phrase = 'hair clips';
const mainProduct = {
  ...catalogueProducts[0], id: 'SYNTHETIC-MAIN-CLIPS', sku: 'SYNTHETIC-MAIN-CLIPS', code: 'SYNTHETIC-MAIN-CLIPS',
  name: 'HAIR CLIPS MAIN FIXTURE', title: 'HAIR CLIPS MAIN FIXTURE',
};
const instoreProduct = {
  ...catalogueProducts[0], id: 'SYNTHETIC-INSTORE-CLIPS', sku: 'SYNTHETIC-INSTORE-CLIPS', code: 'SYNTHETIC-INSTORE-CLIPS',
  name: 'HAIR CLIPS INSTORE FIXTURE', title: 'HAIR CLIPS INSTORE FIXTURE', isExtendedRange: true,
};

test('a stalled optional In-store store cannot hold the first correct card or start a hidden Main read', async ({ page, context }) => {
  await context.routeWebSocket('**/*', socket => socket.close());
  const safety = await installAccessibilityServices(context, { products: [mainProduct] });
  await context.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    window.instoreFixtureStalls = 0;
    IDBFactory.prototype.open = function (name, ...options) {
      if (name !== 'proto-instore') return open.call(this, name, ...options);
      window.instoreFixtureStalls++;
      // Do not fire success, error, or blocked. Only the optional store hangs;
      // the Main catalogue's genuine local store remains available.
      return {};
    };
  });

  let stage = 'login';
  let releaseMain;
  let releaseFullInstore;
  const fullMain = new Promise(resolve => { releaseMain = resolve; });
  const fullInstore = new Promise(resolve => { releaseFullInstore = resolve; });
  const mainRequests = [];
  const pagedRequests = [];
  await context.route(url => url.pathname === '/api/products', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== LOCAL_ORIGIN || request.method() !== 'GET') return route.abort();
    mainRequests.push({ stage, query: url.search });
    // Keep the boot request unresolved so the old App would take its hidden
    // Main browsePath round trip. The featured SKU card can still sign in fast.
    if (!url.search) await fullMain;
    await route.fulfill({ json: [mainProduct] }).catch(() => {});
  });
  await context.route(url => url.pathname === '/api/extended-range', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== LOCAL_ORIGIN || request.method() !== 'GET') return route.abort();
    const full = url.searchParams.get('catalogue') === '1';
    const query = url.searchParams.get('q') || '';
    if (full) await fullInstore;
    else pagedRequests.push({ stage, query, page: url.searchParams.get('page') });
    const products = query === phrase || full ? [instoreProduct] : [];
    await route.fulfill({ json: { products, total: products.length, page: 1, pageSize: 24, tiles: [],
      ...(full ? { catalogue: products } : {}) } }).catch(() => {});
  });

  try {
    await signInCatalogue(page);
    await expect.poll(() => mainRequests.some(({ stage, query }) => stage === 'login' && query === '')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.instoreFixtureStalls)).toBeGreaterThan(0);

    stage = 'instore';
    // Open the dedicated URL directly, not via a warmed Main companion result.
    await page.evaluate(query => { location.hash = '#/instore-products?' + new URLSearchParams({ q: query }); }, phrase);
    await expect(page.locator('.instore-results')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('.instore-grid').getByText(instoreProduct.name, { exact: true }).first()).toBeVisible();
    await expect(page.locator('.instore-grid')).not.toContainText(mainProduct.name);
    expect(pagedRequests.filter(entry => entry.stage === 'instore')).toEqual([{ stage: 'instore', query: phrase, page: '1' }]);
    expect(mainRequests.filter(entry => entry.stage === 'instore')).toEqual([]);

    stage = 'return';
    await page.evaluate(query => { location.hash = '#/?' + new URLSearchParams({ q: query }); }, phrase);
    releaseMain();
    await expect(page.locator('.instore-results')).toHaveCount(0);
    await expect(page.locator('main .product-card').getByText(mainProduct.name, { exact: true }).first()).toBeVisible();
    expect(safety.blockedRequests).toEqual([]);
  } finally {
    releaseMain();
    releaseFullInstore();
  }
});
