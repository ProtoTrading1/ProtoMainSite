import { test, expect } from '@playwright/test';
import process from 'node:process';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const product = { id: '8640000272', sku: '8640000272', code: '8640000272', barcode: '8640000272', name: 'INSTORE ONLY 8640000272 SYNTHETIC', price: 11.5, stockQty: 25, stockOnHand: 25, minQty: 1, image: '/e2e/fixtures/instore-first-results.svg', isExtendedRange: true };
const response = { products: [product], total: 1, page: 1, pageSize: 24, tiles: [] };
const fixture = '/e2e/fixtures/instore-first-results.html#/?q=main+search&colour=Blue';
const stockReply = sku => ({ sku, qty: 25, unitsOfIssue: 'EACH', unitsOfIssueRaw: 'EACH', unitsOfIssueVerified: true, unitsOfIssueSource: 'positill_live', availability: { state: 'in_stock', canOrder: true } });

async function setup(page, context, { idbDelay = 500, stalled = false } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => new URL(route.request().url()).hostname !== '127.0.0.1' ? route.abort() : route.continue());
  await context.route('**/api/*', route => route.fulfill({ json: {} }));
  await context.route('**/api/stock*', async route => {
    const sku = new URL(route.request().url()).searchParams.get('sku');
    expect(sku).toBe(product.sku);
    await new Promise(resolve => setTimeout(resolve, 240));
    await route.fulfill({ json: stockReply(sku) }).catch(() => {});
  });
  await context.addInitScript(({ idbDelay, stalled }) => {
    // Every document is cold; a repeated view within it keeps only response cache.
    sessionStorage.clear();
    window.requestIdleCallback = cb => setTimeout(cb, 0);
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function(name, ...args) {
      if (name !== 'proto-instore') return original.call(this, name, ...args);
      const request = {};
      if (!stalled) setTimeout(() => request.onerror?.(), idbDelay);
      return request;
    };
    window.firstResultsTimings = { requests: [] };
    document.addEventListener('click', event => {
      if (event.target.closest('button')?.textContent.startsWith('Open ')) window.firstResultsTimings.tap = performance.now();
    }, true);
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = String(args[0]);
      if (!/\/api\/(extended-range|stock)\?/.test(url)) return originalFetch(...args);
      const timing = { url, started: performance.now() };
      window.firstResultsTimings.requests.push(timing);
      try {
        const result = await originalFetch(...args);
        timing.response = performance.now(); timing.status = result.status;
        const json = result.json.bind(result);
        result.json = async () => { const data = await json(); timing.parsed = performance.now(); return data; };
        return result;
      } catch (error) { timing.error = error.name; throw error; }
    };
    const observe = () => {
      const timing = window.firstResultsTimings;
      const card = document.querySelector('.instore-grid .product-card');
      if (!timing.tap || !card?.textContent.includes('8640000272')) return;
      timing.cardDom ??= performance.now();
      if (card.querySelector('.stock-readout--in')?.textContent.includes('25')) timing.stockVerified ??= performance.now();
      const image = card.querySelector('img');
      if (!timing.decoding && image?.complete && image.naturalWidth > 0) {
        timing.decoding = true;
        image.decode().then(() => { timing.imageDecoded = performance.now(); }).catch(error => { timing.decodeError = error.name; });
      }
      if (!timing.visible) requestAnimationFrame(() => {
        if (window.firstResultsTimings !== timing || !card.isConnected) return;
        const rect = card.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && getComputedStyle(card).visibility !== 'hidden') timing.visible ??= performance.now();
      });
    };
    new MutationObserver(observe).observe(document, { childList: true, attributes: true, subtree: true });
    document.addEventListener('load', observe, true);
    document.addEventListener('scroll', observe, true);
  }, { idbDelay, stalled });
  if (test.info().project.name.startsWith('mobile')) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  return errors;
}

for (const browse of [false, true]) test(`repeatable ${browse ? 'browse' : 'exact'} cold/warm tap to correct card`, async ({ page, context }) => {
  test.setTimeout(60000);
  const errors = await setup(page, context);
  const calls = [], samples = [], releases = [];
  let run = -1, temperature = 'cold';
  await context.route('**/api/extended-range*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const full = params.get('catalogue') === '1';
    const call = { run, temperature, full, query: params.get('q'), exact: params.get('exact'), page: params.get('page') };
    calls.push(call);
    if (full) {
      // Hold optional full loads until both views are measured, so "warm" has
      // one explicit meaning: this same paged response cached in this module.
      await new Promise(resolve => releases.push(resolve));
    } else {
      expect(call).toMatchObject({ query: browse ? null : product.code, exact: browse ? null : '1', page: '1' });
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    await route.fulfill({ json: full ? { ...response, catalogue: [product] } : response }).catch(() => {});
  });
  try {
    for (run = 0; run < 5; run++) {
      await page.goto(fixture);
      for (temperature of ['cold', 'warm']) {
        const cache = await page.evaluate(({ query, exact }) => window.firstResultsFixture.cache(query, exact), { query: browse ? '' : product.code, exact: !browse });
        expect(cache).toEqual({ catalogue: false, view: temperature === 'warm' });
        const beforeRequests = calls.filter(c => !c.full).length;
        const button = page.getByRole('button', { name: browse ? 'Open Instore browse' : 'Open exact Instore', exact: true });
        await button.scrollIntoViewIfNeeded();
        await page.evaluate(() => { window.firstResultsTimings = { requests: [] }; });
        await button.click();
        const card = page.locator('.instore-grid .product-card').first();
        await expect(card).toContainText(product.name);
        await expect(card).toContainText(product.code);
        // Keep correctness/visible-card timing independent of image and stock.
        await card.scrollIntoViewIfNeeded();
        await expect(card).toBeInViewport();
        await expect.poll(() => page.evaluate(() => Boolean(window.firstResultsTimings.visible))).toBe(true);
        await expect.poll(() => page.evaluate(() => Boolean(window.firstResultsTimings.imageDecoded))).toBe(true);
        const image = card.locator('img').first();
        await expect(image).toHaveAttribute('src', /\/e2e\/fixtures\/instore-first-results\.svg$/);
        const imageEvidence = await image.evaluate(async img => {
          await img.decode();
          return { source: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight, decoded: true };
        });
        expect(imageEvidence).toMatchObject({ width: 96, height: 96, decoded: true });
        await expect(card.locator('.stock-readout--in')).toHaveText('In stock: 25');
        await expect.poll(() => page.evaluate(() => Boolean(window.firstResultsTimings.stockVerified))).toBe(true);
        const timing = await page.evaluate(() => window.firstResultsTimings);
        samples.push({ run, temperature, cache, imageEvidence, ...timing });
        expect(calls.filter(c => !c.full).length - beforeRequests).toBe(temperature === 'cold' ? 1 : 0);
        await expect(page.locator('.instore-grid')).not.toContainText('MAIN FIXTURE');
        await page.goBack();
        await expect(page.getByRole('heading', { name: 'Main fixture' })).toBeVisible();
        expect(await page.evaluate(() => location.hash)).toBe('#/?q=main+search&colour=Blue');
      }
      releases.splice(0).forEach(release => release());
    }
    expect(errors).toEqual([]);
  } finally {
    const pending = await page.evaluate(() => window.firstResultsTimings).catch(() => null);
    const report = { label: process.env.FIRST_RESULTS_LABEL || 'local', project: test.info().project.name, scenario: browse ? 'browse' : 'exact', cpuSlowdown: test.info().project.name.startsWith('mobile') ? 4 : 1, calls, samples, pending, errors };
    console.log(JSON.stringify(report));
    await test.info().attach(`first-results-${report.label}-${report.scenario}`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    releases.splice(0).forEach(release => release());
  }
});

test('diagnostic: record stalled IndexedDB without changing the cache contract', async ({ page, context }) => {
  await setup(page, context, { stalled: true });
  const calls = [];
  await context.route('**/api/extended-range*', route => { calls.push(route.request().url()); return route.fulfill({ json: response }); });
  await page.goto(fixture);
  await page.getByRole('button', { name: 'Open exact Instore' }).click();
  await page.waitForTimeout(750);
  const cards = await page.locator('.instore-grid .product-card').count();
  const report = { diagnosticOnly: true, observationWindowMs: 750, cards, calls, timing: await page.evaluate(() => window.firstResultsTimings) };
  console.log(JSON.stringify(report));
  await test.info().attach('stalled-idb-observation', { body: JSON.stringify(report), contentType: 'application/json' });
  expect(cards).toBeLessThanOrEqual(1);
  await expect(page.locator('.instore')).not.toContainText('MAIN FIXTURE');
});

test('real App retains Main query, refinements, sort and scroll after Instore', async ({ page, context }) => {
  await context.routeWebSocket('**/*', socket => socket.close());
  const main = Array.from({ length: 30 }, (_, i) => ({ ...catalogueProducts[0], id: `MAIN-${i}`, sku: `MAIN-${i}`, code: `MAIN-${i}`, name: `MAIN FIXTURE NOTEBOOK ${i}`, title: `MAIN FIXTURE NOTEBOOK ${i}` }));
  const safety = await installAccessibilityServices(context, { products: main });
  await context.route('**/api/stock*', route => route.fulfill({ json: stockReply(new URL(route.request().url()).searchParams.get('sku')) }));
  await context.route('**/api/extended-range*', route => route.fulfill({ json: { ...response, products: [{ ...product, name: 'INSTORE ONLY NOTEBOOK 8640000272 SYNTHETIC' }] } }));
  await signInCatalogue(page);
  const mainHash = '#/?q=notebook&colour=Blue';
  await page.evaluate(hash => { location.hash = hash; }, mainHash);
  await expect(page.locator('main .product-card').first()).toContainText('MAIN FIXTURE');
  await page.getByRole('combobox', { name: 'Sort products' }).selectOption('price-high');
  const open = page.getByRole('button', { name: 'See all 1 Instore matches' });
  await open.scrollIntoViewIfNeeded();
  const snapshot = () => page.evaluate(() => ({ window: window.scrollY, containers: ['.content-area', '.main-layout', '.app-root'].map(selector => ({ selector, top: document.querySelector(selector)?.scrollTop || 0 })) }));
  const before = await snapshot();
  expect(Math.max(before.window, ...before.containers.map(c => c.top))).toBeGreaterThan(100);
  let after;
  try {
    await open.click();
    await expect(page.locator('.instore-grid')).toContainText('8640000272');
    await expect(page.locator('.instore-grid')).not.toContainText('MAIN FIXTURE');
    await page.goBack();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(mainHash);
    await expect(page.locator('main .product-card').first()).toContainText('MAIN FIXTURE');
    await expect(page.getByRole('combobox', { name: 'Sort products' })).toHaveValue('price-high');
    await expect.poll(async () => { after = await snapshot(); return after; }).toEqual(before);
    expect(safety.blockedRequests).toEqual([]);
  } finally {
    after = await snapshot();
    await test.info().attach('real-app-main-return-scroll', { body: JSON.stringify({ before, after }), contentType: 'application/json' });
  }
});
