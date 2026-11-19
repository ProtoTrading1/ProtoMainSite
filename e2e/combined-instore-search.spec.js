import { test, expect } from '@playwright/test';

const section = page => page.getByRole('region', { name: 'More matching products across Proto' });
const response = (products, total = products.length) => ({ products, total, page: 1, pageSize: 24 });
const product = { id: 'SYNTHETIC-HAIR', sku: 'HAIR001', name: 'Hair clip purple', price: 15, stockQty: 20, image: '/favicon.svg' };

test('slow cross-catalogue search has one visible active status and keeps main results available', async ({ page, context }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await context.route('**/api/extended-range*', async route => { await held; await route.fulfill({ json: response([product]) }); });
  await page.goto('/e2e/fixtures/combined-instore-search.html');
  const panel = section(page);
  await expect(panel.locator('.catalog-instore-results-content')).toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByText('Searching Instore…', { exact: true })).toHaveCount(1);
  await expect(panel.locator('[role="status"]')).toBeVisible();
  await expect(panel.locator('.catalog-instore-spinner')).toBeVisible();
  await expect(panel).toContainText('58 in the main catalogue');
  await expect(page.getByText('Main catalogue result', { exact: true }).first()).toBeVisible();
  await expect(panel).not.toContainText('No additional Instore matches');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(panel.locator('.catalog-instore-spinner')).toHaveCSS('animation-name', 'none');
  release();
  await expect(panel.locator('.catalog-instore-results-content')).toHaveAttribute('aria-busy', 'false');
  await expect(panel.getByRole('heading', { name: product.name })).toBeVisible();
  await expect(panel.locator('.catalog-instore-status--searching')).toHaveCount(0);
});

test('a catalogue arriving during a slow paged request answers locally without waiting for that request', async ({ page, context }) => {
  await page.addInitScript(() => { window.requestIdleCallback = callback => window.setTimeout(callback, 0); });
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let paged = 0;
  await context.route('**/api/extended-range*', async route => {
    if (new URL(route.request().url()).searchParams.has('catalogue')) {
      const products = await page.evaluate(() => window.combinedSearchFixture.products);
      await route.fulfill({ json: { ...response(products.slice(0, 24), products.length), catalogue: products } });
    } else {
      paged++;
      await held;
      await route.fulfill({ json: response([]) }).catch(() => {});
    }
  });
  await page.goto('/e2e/fixtures/combined-instore-search.html');
  await expect.poll(() => paged).toBe(1);
  await page.evaluate(() => window.combinedSearchFixture.refresh());
  await expect(section(page).locator('.catalog-instore-results-content')).toHaveAttribute('aria-busy', 'false');
  await expect(section(page)).toContainText('278 additional Instore matches');
  await expect(section(page).locator('.instore-result-card')).toHaveCount(12);
  release();
  await expect(section(page)).toContainText('278 additional Instore matches');
  const input = page.getByRole('textbox', { name: 'Search all products' });
  await input.fill('hair clips');
  await expect(section(page).locator('.instore-result-card')).toHaveCount(12);
  await expect(section(page).getByRole('heading', { name: 'HAIR CLIP PURPLE' }).first()).toBeVisible();
  expect(paged).toBe(1);
});

test('a stale response cannot replace current results or leave loading stuck after clearing', async ({ page, context }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let oldStarted = false;
  await context.route('**/api/extended-range*', async route => {
    if (new URL(route.request().url()).searchParams.get('q') === 'bracelets') {
      oldStarted = true;
      await held;
      await route.fulfill({ json: response([{ ...product, id: 'STALE', name: 'Stale bracelet' }]) }).catch(() => {});
    } else await route.fulfill({ json: response([product]) });
  });
  await page.goto('/e2e/fixtures/combined-instore-search.html');
  await expect.poll(() => oldStarted).toBe(true);
  await page.getByRole('textbox', { name: 'Search all products' }).fill('hair clips');
  await expect(section(page).getByRole('heading', { name: product.name })).toBeVisible();
  release();
  await expect(section(page).locator('.catalog-instore-results-content')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('Stale bracelet', { exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search all products' }).fill('');
  await expect(section(page)).toHaveCount(0);
});

test('empty and error responses have different feedback and both end the searching state', async ({ page, context }) => {
  await context.route('**/api/extended-range*', route => route.fulfill({
    status: new URL(route.request().url()).searchParams.get('q') === 'offline' ? 503 : 200,
    json: response([]),
  }));
  await page.goto('/e2e/fixtures/combined-instore-search.html');
  await expect(section(page)).toContainText('No additional Instore matches found.');
  await expect(section(page).locator('.catalog-instore-results-content')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('textbox', { name: 'Search all products' }).fill('offline');
  await expect(section(page)).toContainText('Instore results are temporarily unavailable');
  await expect(section(page)).not.toContainText('No additional Instore matches');
  await expect(section(page).locator('.catalog-instore-results-content')).toHaveAttribute('aria-busy', 'false');
});
