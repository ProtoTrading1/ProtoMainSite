import { expect, test } from '@playwright/test';
import { installAccessibilityServices, signInCatalogue, catalogueProducts, syntheticSession } from './helpers/accessibility-services.js';

test('profile controls have associated accessible labels without saving changes', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await signInCatalogue(page);
  await page.getByRole('button', { name: /^My profile$/i }).click();
  await expect(page.getByRole('heading', { name: 'My Details', exact: true })).toBeVisible();
  const details = page.getByRole('heading', { name: 'My Details', exact: true }).locator('..');
  const controls = details.locator('input,select');
  expect(await controls.count()).toBeGreaterThanOrEqual(10);
  for (const control of await controls.all()) await expect(control).toHaveAccessibleName(/.+/);
  await expect(details.getByRole('textbox', { name: 'Contact number', exact: true })).toBeVisible();
  await page.screenshot({ path: `../preview-evidence/corrected-profile-${test.info().project.name}.png`, fullPage: true });
});

test('ordinary over-stock actions match warnings while To order remains exempt', async ({ page, context }) => {
  const regular = { ...catalogueProducts[0], stockOnHand: 587, stockQty: 587 };
  const sourced = { ...catalogueProducts[1], stockOnHand: 10, stockQty: 10, toOrder: true, to_order: true };
  await installAccessibilityServices(context, { products: [regular, sourced] });
  await signInCatalogue(page);
  const regularCard = page.locator('.product-card').filter({ has: page.getByRole('button', { name: `View ${regular.name}`, exact: true }) });
  await regularCard.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('588');
  await regularCard.getByRole('spinbutton', { name: 'Quantity', exact: true }).blur();
  await expect(regularCard.getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  await expect(regularCard.locator('.pc-stock-advisory')).toContainText('reduce the quantity before adding');
  await regularCard.getByRole('button', { name: `View ${regular.name}`, exact: true }).click();
  const modal = page.getByRole('dialog', { name: regular.name, exact: true });
  await modal.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('588');
  await modal.getByRole('spinbutton', { name: 'Quantity', exact: true }).blur();
  await expect(modal.getByRole('button', { name: 'Add 588 to order', exact: true })).toBeDisabled();
  await expect(modal.locator('.pz-stock-advisory')).toContainText('reduce the quantity before adding');
  await modal.screenshot({ path: `../preview-evidence/corrected-stock-${test.info().project.name}.png` });
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  const sourcedCard = page.locator('.product-card').filter({ has: page.getByRole('button', { name: `View ${sourced.name}`, exact: true }) });
  await sourcedCard.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('15');
  await sourcedCard.getByRole('spinbutton', { name: 'Quantity', exact: true }).blur();
  await expect(sourcedCard.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await expect(sourcedCard.locator('.pc-stock-advisory')).toHaveCount(0);
  await sourcedCard.getByRole('button', { name: `View ${sourced.name}`, exact: true }).click();
  const sourcedModal = page.getByRole('dialog', { name: sourced.name, exact: true });
  await sourcedModal.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('15');
  await sourcedModal.getByRole('spinbutton', { name: 'Quantity', exact: true }).blur();
  await expect(sourcedModal.getByRole('button', { name: 'Add 15 to order', exact: true })).toBeEnabled();
});

test('shared-session commit is explicit; dismissal is blocked only while finishing', async ({ page, context }) => {
  await installAccessibilityServices(context);
  let release, started = false;
  const gate = new Promise(resolve => { release = resolve; });
  await context.route('**/mock-supabase/auth/v1/user', async route => {
    started = true;
    await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(syntheticSession().user) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill('critical@protoe2e.co.za');
  await dialog.locator('input[type=password]').fill('SyntheticCritical123!');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Close sign-in', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /Finishing sign in/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(page.locator('.product-card').first()).toBeVisible();
});
