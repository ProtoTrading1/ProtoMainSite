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
  await expect(page.getByRole('heading', { name: /wholesale/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /apply for a trade account/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
});

test('sign-in validates locally and reset mail is safely intercepted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog.getByText('Please enter your email and password.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(dialog.getByRole('heading', { name: 'Reset password.' })).toBeVisible();
  await dialog.getByPlaceholder('name@business.co.za').fill('safe-e2e@example.com');
  await dialog.getByRole('button', { name: 'Send reset link' }).click();
  await expect(dialog.getByText('Blocked by non-destructive E2E suite')).toBeVisible();
});

test('registration cannot advance without required contact details', async ({ page }) => {
  await page.goto('/register');

  await expect(page.getByRole('heading', { name: 'Your contact details' })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue/i })).toBeDisabled();
});

test('registration requires at least one business category', async ({ page }) => {
  await page.goto('/register');

  await page.getByPlaceholder('Full contact name').fill('Safe Browser Test');
  await page.getByPlaceholder('name@business.co.za').fill('safe-e2e@example.com');
  await page.getByPlaceholder('+27').fill('0821234567');
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await page.getByPlaceholder('At least 8 characters').fill('SafeTest123!');
  await page.getByPlaceholder('Re-enter password').fill('SafeTest123!');
  await page.getByRole('button', { name: /continue/i }).click();

  await page.getByPlaceholder('Name').fill('Safe Test Company');
  await page.getByRole('button', { name: /continue/i }).click();

  await expect(page.getByRole('heading', { name: 'Tell us about your business' })).toBeVisible();
  await expect(page.getByRole('button', { name: /continue/i })).toBeDisabled();

  await page.getByRole('button', { name: 'Retail store', exact: true }).click();
  await expect(page.getByRole('button', { name: /continue/i })).toBeEnabled();
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByRole('heading', { name: 'Your addresses' })).toBeVisible();
});

test('policy route renders and returns to the public home', async ({ page }) => {
  await page.goto('/#/policies/terms');
  await expect(page.getByRole('heading', { name: 'Proto Trading Policies' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Policies navigation' })).toBeVisible();
  await page.getByRole('link', { name: /back to home/i }).click();
  await expect(page).toHaveURL(/\/$/);
});
