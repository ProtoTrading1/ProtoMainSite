import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // The release suite must never create a customer, authenticate, or send mail.
  await page.route('**/api/**', async (route) => {
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
  await expect(page.getByRole('heading', { name: 'Welcome to our new online store' })).toBeVisible();
  await expect(page.getByRole('button', { name: /apply for a trade account/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
});

test('sign-in validates locally and reset mail is safely intercepted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
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
  await page.goto('/register');

  await expect(page.getByRole('heading', { name: 'Start with the core company details.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
});

test('registration requires at least one business category', async ({ page }) => {
  await page.goto('/register');

  await page.getByPlaceholder('Name', { exact: true }).fill('Safe Test Company');
  await page.getByPlaceholder('Full contact name').fill('Safe Browser Test');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await page.getByPlaceholder('name@business.co.za').fill('safe-e2e@protoe2e.co.za');
  await page.getByPlaceholder('+27').fill('0821234567');
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await page.getByPlaceholder('At least 8 characters').fill('SafeTest123!');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await page.getByPlaceholder('Street name and number').fill('1 Safety Street');
  await page.getByPlaceholder('Suburb').fill('Safe Suburb');
  await page.getByPlaceholder('Postal code').fill('8001');
  await page.getByPlaceholder('City').fill('Cape Town');
  await page.getByRole('checkbox', { name: 'Same as billing address' }).check();
  await page.getByRole('button', { name: 'House', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Step 4 of 4 — Additional')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit application' })).toBeDisabled();

  await page.getByRole('button', { name: 'Retail store', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Submit application' })).toBeEnabled();
});

test('policy route renders and returns to the public home', async ({ page }) => {
  await page.goto('/#/policies/terms');
  await expect(page.getByRole('heading', { name: 'Proto Trading Policies' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Policies navigation' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Policies navigation' })
    .getByRole('link', { name: 'Back to home' })
    .click();
  await expect(page).toHaveURL(/\/$/);
});
