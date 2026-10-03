import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, TEST_EMAIL, TEST_PASSWORD } from './helpers/accessibility-services.js';

async function signInWithoutCatalogue(page) {
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill(TEST_EMAIL);
  await dialog.locator('input[type="password"]').fill(TEST_PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('a failed catalogue search is retryable and never recorded as zero results', async ({ page, context }) => {
  await installAccessibilityServices(context);
  let fail = true;
  const searches = [];
  await context.route('**/api/products**', (route) => route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { error: 'Synthetic catalogue outage' } : catalogueProducts) }));
  for (const endpoint of ['search-analytics', 'shopping-events']) {
    await context.route(`**/api/${endpoint}`, (route) => {
      searches.push({ endpoint, data: route.request().postDataJSON() });
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
  }
  await page.goto('/#/?q=notebook');
  await signInWithoutCatalogue(page);
  await expect(page.getByRole('heading', { name: 'We couldn’t load the main catalogue.' })).toBeVisible();
  await expect(page.getByText('No products match your current filters.', { exact: true })).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(searches.filter(({ endpoint, data }) => endpoint === 'search-analytics' || data?.eventType === 'search' || data?.event_type === 'search')).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('catalogue-recovery.png'), fullPage: false });
  fail = false;
  await page.getByRole('button', { name: 'Retry catalogue' }).click();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'We couldn’t load the main catalogue.' })).toHaveCount(0);
  await expect(page.locator('.active-search-chip')).toContainText('notebook');
});

test('a failed reset-link check can recover without declaring the link expired', async ({ page, context }) => {
  await installAccessibilityServices(context);
  let attempts = 0;
  let fail = true;
  await context.route('**/api/validate-reset-token', (route) => {
    attempts++;
    return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: fail ? '{"error":"Temporary outage"}' : '{"valid":true}' });
  });
  await page.goto('/#/reset-password?token=synthetic-only');
  await expect(page.getByRole('button', { name: 'Retry link check' })).toBeVisible();
  await expect(page.getByText(/link is invalid|link is no longer valid|expired, or/)).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('reset-recovery.png'), fullPage: false });
  fail = false;
  const failedAttempts = attempts;
  await page.getByRole('button', { name: 'Retry link check' }).click();
  await expect(page.getByLabel('New password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry link check' })).toHaveCount(0);
  expect(attempts).toBeGreaterThan(failedAttempts);
});

test('public route import failure renders recovery even when storage is blocked', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await context.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Synthetic storage denial'); } }));
  await context.route('**/src/pages/PoliciesPage.jsx*', (route) => route.abort());
  await page.goto('/#/policies');
  await expect(page.getByRole('heading', { name: 'We couldn’t load this page.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh page' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Return to home' })).toHaveAttribute('href', '/');
  await page.screenshot({ path: test.info().outputPath('page-recovery.png'), fullPage: false });
});

test('a stalled Featured request ends with recovery and a fresh retry succeeds', async ({ page, context }) => {
  await installAccessibilityServices(context);
  let stalled = true;
  let requested = false;
  await context.route('**/api/featured-products', (route) => {
    requested = true;
    if (stalled) return;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: catalogueProducts.map(({ sku }) => ({ sku })) }) });
  });
  await page.goto('/');
  await signInWithoutCatalogue(page);
  await expect.poll(() => requested).toBe(true);
  await expect(page.locator('.catalog-page')).toBeVisible();
  // Use the real request deadline: boot prefetch, lazy mount and catalogue
  // dependency updates may schedule their work after a fake clock advances.
  await expect(page.getByRole('heading', { name: 'We couldn’t load the main catalogue.' })).toBeVisible({ timeout: 15_000 });
  stalled = false;
  await page.getByRole('button', { name: 'Retry catalogue' }).click();
  await expect(page.locator('.product-card').first()).toBeVisible();
});

test('an optional map import failure leaves public navigation and registration available', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await context.route('**/src/components/SouthernAfricaMap.jsx*', (route) => route.abort());
  await page.goto('/');
  const fallback = page.getByRole('status').filter({ hasText: 'The interactive map is unavailable.' });
  await fallback.scrollIntoViewIfNeeded();
  await expect(fallback).toBeVisible();
  await expect(page.getByRole('heading', { name: 'We couldn’t load this page.' })).toHaveCount(0);
  await expect(page.locator('#lp-apply')).toBeAttached();
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeVisible();
});
