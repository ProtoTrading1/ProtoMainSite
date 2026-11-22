import { test, expect } from '@playwright/test';
import process from 'node:process';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const product = { id: '8640000272', sku: '8640000272', code: '8640000272', barcode: '8640000272', name: 'INSTORE ONLY 8640000272 SYNTHETIC', price: 11.5, stockQty: 25, stockOnHand: 25, minQty: 1, image: '/favicon.svg', isExtendedRange: true };
const response = { products: [product], total: 1, page: 1, pageSize: 24, tiles: [] };
const fixture = '/e2e/fixtures/instore-first-results.html#/?q=main+search&colour=Blue';

async function setup(page, context, { idbDelay = 500, stalled = false } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => new URL(route.request().url()).hostname !== '127.0.0.1' ? route.abort() : route.continue());
  await context.route('**/api/*', route => route.fulfill({ json: {} }));
  await context.route('**/api/stock*', route => route.fulfill({ json: { qty: 25, unitsOfIssue: 'EACH', unitsOfIssueVerified: true, availability: { state: 'in_stock', canOrder: true } } }));
  await context.addInitScript(({ idbDelay, stalled }) => {
    window.requestIdleCallback = cb => setTimeout(cb, 0);
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, ...args) {
      if (name !== 'proto-instore') return original.call(this, name, ...args);
      const request = {};
      if (!stalled) setTimeout(() => request.onerror?.(), idbDelay);
      return request;
    };
    window.firstResultsTimings = {};
    document.addEventListener('click', event => {
      if (event.target.closest('button')?.textContent.startsWith('Open ')) window.firstResultsTimings.tap = performance.now();
    }, true);
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      if (!String(args[0]).includes('/api/extended-range')) return originalFetch(...args);
      const started = performance.now();
      const result = await originalFetch(...args);
      if (!String(args[0]).includes('catalogue=1')) {
        const timing = { started, response: performance.now() };
        window.firstResultsTimings.request = timing;
        const json = result.json.bind(result);
        result.json = async () => { const data = await json(); timing.parsed = performance.now(); return data; };
      }
      return result;
    };
  }, { idbDelay, stalled });
  if (test.info().project.name.startsWith('mobile')) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  return errors;
}

for (const browse of [false, true]) test(`repeatable ${browse ? 'browse' : 'exact'} cold/warm tap to correct card`, async ({ page, context }) => {
  const errors = await setup(page, context);
  const calls = [];
  await context.route('**/api/extended-range*', async route => {
    const full = new URL(route.request().url()).searchParams.has('catalogue');
    calls.push({ full });
    // Fixed synthetic service times; no claims about production SQL latency.
    await new Promise(resolve => setTimeout(resolve, full ? 900 : 180));
    await route.fulfill({ json: full ? { ...response, catalogue: [product] } : response }).catch(() => {});
  });
  const samples = [];
  for (let run = 0; run < 5; run++) {
    // Reload resets in-memory data; session response cache is deliberately cold.
    await page.goto(fixture);
    await page.evaluate(() => sessionStorage.clear());
    for (const temperature of ['cold', 'warm']) {
      const button = page.getByRole('button', { name: browse ? 'Open Instore browse' : 'Open exact Instore', exact: true });
      await button.scrollIntoViewIfNeeded();
      await page.evaluate(() => { window.firstResultsTimings = {}; });
      await button.click();
      const card = page.locator('.instore-grid .product-card').first();
      await expect(card).toContainText('8640000272');
      // The existing hero puts cards below the fold: include the scripted reveal
      // in the visible-card metric and report that limitation with the results.
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeInViewport();
      await expect(card.locator('img').first()).toBeVisible();
      await expect.poll(() => card.locator('img').first().evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const timing = await page.evaluate(() => ({ ...window.firstResultsTimings, visible: performance.now() }));
      samples.push({ run, temperature, tapToVisibleMs: timing.visible - timing.tap, tapToRequestMs: timing.request ? timing.request.started - timing.tap : null, requestMs: timing.request ? timing.request.response - timing.request.started : null, parseMs: timing.request ? timing.request.parsed - timing.request.response : null, responseToVisibleMs: timing.request ? timing.visible - timing.request.response : null });
      await expect(page.locator('.instore-grid')).not.toContainText('MAIN FIXTURE');
      const mainHash = '#/?q=main+search&colour=Blue';
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'Main fixture' })).toBeVisible();
      await expect(page).toHaveURL(/q=main\+search&colour=Blue/);
      expect(await page.evaluate(() => location.hash)).toBe(mainHash);
    }
  }
  expect(errors).toEqual([]);
  const report = { label: process.env.FIRST_RESULTS_LABEL || 'candidate', project: test.info().project.name, scenario: browse ? 'browse' : 'exact', cpuSlowdown: test.info().project.name.startsWith('mobile') ? 4 : 1, calls, samples };
  console.log(JSON.stringify(report));
  await test.info().attach(`first-results-${report.label}-${report.scenario}`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
});

test('diagnostic: blocked browser storage still yields the exact eligible card', async ({ page, context }) => {
  await setup(page, context, { stalled: true });
  await context.route('**/api/extended-range*', route => route.fulfill({ json: response }));
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Open exact Instore' }).click();
  // This desired contract may fail on the pinned baseline: hydration currently
  // gates the paged request indefinitely. Keep separate from timing samples.
  await expect(page.locator('.instore-grid')).toContainText('8640000272', { timeout: 2500 });
});


test('diagnostic: real App retains Main query, refinements, sort and scroll after Instore', async ({ page, context }) => {
  await context.routeWebSocket('**/*', socket => socket.close());
  const main = Array.from({ length: 30 }, (_, i) => ({ ...catalogueProducts[0], id: `MAIN-${i}`, sku: `MAIN-${i}`, code: `MAIN-${i}`, name: `MAIN FIXTURE NOTEBOOK ${i}`, title: `MAIN FIXTURE NOTEBOOK ${i}` }));
  const safety = await installAccessibilityServices(context, { products: main });
  await context.route('**/api/extended-range*', route => route.fulfill({ json: { ...response, products: [{ ...product, name: 'INSTORE ONLY NOTEBOOK 8640000272 SYNTHETIC' }] } }));
  await signInCatalogue(page);
  const mainHash = '#/?q=notebook&colour=Blue';
  await page.evaluate(hash => { location.hash = hash; }, mainHash);
  await expect(page.locator('main .product-card').first()).toContainText('MAIN FIXTURE');
  await page.getByRole('combobox', { name: 'Sort products' }).selectOption('price-high');
  const open = page.getByRole('button', { name: 'See all 1 Instore matches' });
  await open.scrollIntoViewIfNeeded();
  const snapshot = () => page.evaluate(() => ({
    window: window.scrollY,
    containers: ['.content-area', '.main-layout', '.app-root'].map(selector => ({ selector, top: document.querySelector(selector)?.scrollTop || 0 })),
  }));
  const before = await snapshot();
  await open.click();
  await expect(page.locator('.instore-grid')).toContainText('8640000272');
  await expect(page.locator('.instore-grid')).not.toContainText('MAIN FIXTURE');
  await page.goBack();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe(mainHash);
  await expect(page.locator('main .product-card').first()).toContainText('MAIN FIXTURE');
  await expect(page.getByRole('combobox', { name: 'Sort products' })).toHaveValue('price-high');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await snapshot();
  await test.info().attach('real-app-main-return-scroll', { body: JSON.stringify({ before, after }), contentType: 'application/json' });
  // This is a desired route-continuity guard, not a claim that baseline passes.
  expect(after).toEqual(before);
  expect(safety.blockedRequests).toEqual([]);
});
