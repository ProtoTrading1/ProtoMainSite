import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, installAccessibilityServices, TEST_EMAIL, TEST_PASSWORD } from './helpers/accessibility-services.js';

const TOKEN_HASH = 'synthetic-mailbox-proof-token-only';

test('confirmation waits for a click, recovers from an outage, and clears the consumed token', async ({ page, context }) => {
  await installAccessibilityServices(context);
  const attempts = [];
  let fail = true;
  await context.route('**/api/verify-trade-email', (route) => {
    attempts.push(route.request().postDataJSON());
    return route.fulfill({
      status: fail ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(fail ? { error: 'Confirmation is temporarily unavailable. Please try again.' }
        : { ok: true, verified: true, approved: true }),
    });
  });
  await page.goto(`/#/verify-email?token_hash=${TOKEN_HASH}`);
  const confirm = page.getByRole('button', { name: 'Confirm my email', exact: true });
  await expect(confirm).toBeVisible();
  // A link scanner or page reload must never consume the one-time proof.
  await page.reload();
  await expect(confirm).toBeVisible();
  expect(attempts).toEqual([]);
  await expect(page.locator('.reset-password-card')).toHaveCSS('background-color', 'rgb(17, 17, 17)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('confirm-email-ready.png'), fullPage: false });
  await confirm.click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await expect(confirm).toBeEnabled();
  expect(attempts).toEqual([{ tokenHash: TOKEN_HASH }]);
  expect(page.url()).toContain(TOKEN_HASH);
  fail = false;
  await confirm.click();
  await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Your trade account is approved');
  await expect(page).toHaveURL(/\/#\/verify-email$/);
  await expect(confirm).toHaveCount(0);
  expect(attempts).toHaveLength(2);
  // Confirmation does not establish a browser Auth session or open the catalogue.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.endsWith('-auth-token')))).toEqual([]);
  await expect(page.locator('.product-card')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('confirm-email-success.png'), fullPage: false });
  await page.getByRole('button', { name: 'Go to sign in', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Welcome back.' })).toBeVisible();
  expect(page.url()).not.toContain(TOKEN_HASH);
});

test('an incomplete confirmation link offers sign in without sending a confirmation request', async ({ page, context }) => {
  await installAccessibilityServices(context);
  let attempts = 0;
  await context.route('**/api/verify-trade-email', (route) => {
    attempts++;
    return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Synthetic incomplete link"}' });
  });
  await page.goto('/#/verify-email');
  await expect(page.getByText('This link is incomplete. Request a new confirmation email from sign in.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm my email' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await expect(dialog).toBeVisible();
  expect(attempts).toBe(0);
});

test('a pending mailbox confirmation stays closed and its resend can recover', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await context.route('**/api/customer-profile**', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ profile: {
      id: ACCOUNT_ID, email: TEST_EMAIL, name: 'Synthetic Customer', role: 'customer', is_approved: true,
      trade_email_verification_required: true, trade_email_verified_at: null,
    } }),
  }));
  const resends = [];
  let fail = true;
  await context.route('**/api/resend-trade-verification', (route) => {
    resends.push(route.request().postDataJSON());
    return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(fail ? { error: 'Confirmation email is temporarily unavailable.' } : { ok: true }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill(TEST_EMAIL);
  await dialog.locator('input[type="password"]').fill(TEST_PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
  await expect(page.locator('.reset-password-card')).toHaveCSS('background-color', 'rgb(17, 17, 17)');
  const resend = page.getByRole('button', { name: 'Resend confirmation email', exact: true });
  await resend.click();
  await expect(page.getByRole('status')).toContainText('temporarily unavailable');
  await expect(resend).toBeEnabled();
  fail = false;
  await resend.click();
  await expect(page.getByRole('status')).toContainText('If your application needs confirmation');
  expect(resends).toEqual([{ email: TEST_EMAIL }, { email: TEST_EMAIL }]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('pending-email-confirmation.png'), fullPage: false });
});
