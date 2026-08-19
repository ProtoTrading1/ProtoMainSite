import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // The release suite must never create a customer, authenticate, or send mail.
  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/check-registration-email') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true, exists: false, recovery: null }),
      });
      return;
    }
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Blocked by non-destructive E2E suite' }),
    });
  });
});

test('public home exposes trade registration and sign-in', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Proto/i);
  await expect(page.getByRole('heading', { name: 'Welcome to Proto Trading Online' })).toBeVisible();
  // Both registration journeys have to be reachable from the hero.
  await expect(page.getByRole('button', { name: /register again/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /apply for online access/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
});

test('sign-in validates locally and reset mail is safely intercepted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();

  // Keep this locator stable when the heading (and therefore accessible name)
  // changes from sign-in to password recovery.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Native required fields stop an empty form before React receives submit.
  await expect(dialog.locator('input[type="email"]')).toHaveAttribute('required', '');
  await expect(dialog.locator('input[type="password"]')).toHaveAttribute('required', '');

  await dialog.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(dialog.getByRole('heading', { name: 'Reset password.' })).toBeVisible();
  await dialog.getByPlaceholder('name@business.co.za').fill('safe-e2e@example.com');
  await dialog.getByRole('button', { name: 'Send reset link' }).click();
  await expect(dialog.getByText('Blocked by non-destructive E2E suite')).toBeVisible();
});

test('registration cannot advance without required contact details', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Start with the core company details.' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Enter your company name and the contact person’s full name.',
  );
  await expect(page.getByRole('heading', { name: 'Start with the core company details.' })).toBeVisible();
});

test('registration requires structured business details', async ({ page }) => {
  await page.goto('/');

  await page.getByPlaceholder('Name', { exact: true }).fill('Safe Test Company');
  await page.getByPlaceholder('Full contact name').fill('Safe Browser Test');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await page.getByPlaceholder('name@business.co.za').fill('safe-e2e@protoe2e.co.za');
  await page.getByPlaceholder('+27').fill('0821234567');
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByPlaceholder('At least 8 characters').fill('SafeTest123!');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  const addressesStep = page.getByRole('heading', { name: 'Billing and delivery addresses' })
    .locator('..');
  await addressesStep.getByPlaceholder('Street name and number').first().fill('1 Safety Street');
  await addressesStep.getByPlaceholder('Suburb').first().fill('Safe Suburb');
  await addressesStep.getByPlaceholder('Postal code').first().fill('8001');
  await addressesStep.getByPlaceholder('City').first().fill('Cape Town');
  await addressesStep.getByPlaceholder('Street name and number').last().fill('1 Safety Street');
  await addressesStep.getByPlaceholder('Suburb').last().fill('Safe Suburb');
  await addressesStep.getByPlaceholder('Postal code').last().fill('8001');
  await addressesStep.getByPlaceholder('City').last().fill('Cape Town');
  await page.getByRole('button', { name: 'House', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Step 4 of 4 — Business')).toBeVisible();
  const submitApplication = page.getByRole('button', { name: 'Submit application' });
  await submitApplication.click();
  await expect(page.getByRole('alert')).toContainText(
    'Select at least one way you trade, at least one product category, and describe your business in at least 20 characters.',
  );

  await page.getByRole('button', { name: 'Physical retail store', exact: true }).click();
  await page.getByRole('button', { name: 'Art, craft & beads', exact: true }).click();
  await page.getByPlaceholder(/Gifts and party supplies sold/).fill(
    'We sell gifts and craft supplies to walk-in retail customers.',
  );
  await submitApplication.click();
  await expect(page.getByRole('alert')).toContainText('Blocked by non-destructive E2E suite');
});

test('policy route renders and returns to the public home', async ({ page }) => {
  await page.goto('/#/policies/terms');
  await expect(page.getByRole('heading', { name: 'Proto Trading Policies' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Policies navigation' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Policies navigation' })
    .getByRole('link', { name: 'Back to home' })
    .click();
  await expect(page.getByRole('heading', { name: 'Welcome to Proto Trading Online' })).toBeVisible();
});
