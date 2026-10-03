import { test, expect } from '@playwright/test';
import { installAccessibilityServices, TEST_EMAIL, TEST_PASSWORD } from './helpers/accessibility-services.js';

test('late initial focus cannot redirect password entry into email', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await page.goto('/');
  await page.evaluate(() => {
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => {
      // Hold the former initial-input focus callback until the customer has
      // moved into the password. Other animation frames continue normally.
      if (/querySelector\(['"]input['"]\).*focus/s.test(String(callback))) {
        window.__delayedLoginFocus = callback;
        return -1;
      }
      return original.call(window, callback);
    };
  });
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  const email = dialog.getByPlaceholder('name@business.co.za');
  const password = dialog.locator('input[type=password]');
  await expect(email).toBeFocused();
  await email.fill(TEST_EMAIL);
  await password.focus();
  await page.evaluate(() => window.__delayedLoginFocus?.(performance.now()));
  await page.keyboard.insertText(TEST_PASSWORD);
  await expect(email).toHaveValue(TEST_EMAIL);
  await expect(password).toHaveValue(TEST_PASSWORD);
  await expect(password).toBeFocused();
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.product-card').first()).toBeVisible();
});
