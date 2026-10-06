import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('history distinguishes a failed read from confirmed empty and retries only the history read', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await signInCatalogue(page);
  let reads = 0;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  await context.route('**/mock-supabase/rest/v1/orders?*', async route => {
    // Mobile App's last-order read may still be in flight; this test owns only history.
    if (new URL(route.request().url()).searchParams.get('limit') !== '10') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    reads++;
    if (reads === 1) {
      await blocked;
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic unavailable' }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  const writes = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (['/api/send-order', '/api/checkout-recovery', '/api/customer-profile'].includes(path) && request.method() !== 'GET') writes.push(`${request.method()} ${path}`);
  });
  await page.getByRole('button', { name: /my profile/i }).filter({ visible: true }).first().click();
  await expect(page.getByText('Loading your orders.')).toBeVisible();
  await expect(page.getByText('No orders placed yet.')).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: 'Retry order history' })).toBeVisible();
  await expect(page.getByText('No orders placed yet.')).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry order history' }).click();
  await expect(page.getByText('No orders placed yet.')).toBeVisible();
  expect(reads).toBe(2); expect(writes).toEqual([]);
});
