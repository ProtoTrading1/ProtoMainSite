import { expect, test } from '@playwright/test';

for (const country of ['Kenya', 'Uganda']) {
  test(`international application preserves ${country} and Nairobi address`, async ({ page }) => {
    let application;
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/register-trade') application = route.request().postDataJSON();
      await route.fulfill({
        status: path === '/api/check-registration-email' ? 200 : 503,
        contentType: 'application/json',
        body: JSON.stringify(path === '/api/check-registration-email'
          ? { ok: true, validationOnly: true }
          : { error: 'Test application intercepted; no account created.' }),
      });
    });
    await page.goto('/');
    await page.getByPlaceholder('Name', { exact: true }).fill('International Test Company');
    await page.getByPlaceholder('Full contact name').fill('International Browser Test');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByPlaceholder('name@business.co.za').fill('international@protoe2e.co.za');
    await page.getByPlaceholder('+27').fill('+254712345678');
    await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
    await page.getByPlaceholder('At least 10 characters').fill('SafeTest123!');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Change country', exact: true }).click();
    if (country === 'Kenya') {
      await page.getByRole('button', { name: 'Kenya', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Kenya', exact: true })).toHaveAttribute('aria-pressed', 'true');
    } else {
      await page.getByRole('button', { name: 'Other country', exact: true }).click();
      await expect(page.getByLabel('Country name')).toHaveAttribute('required', '');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Billing and delivery addresses' })).toBeVisible();
      await page.getByLabel('Country name').fill(country);
      await page.getByRole('button', { name: 'Other country', exact: true }).click();
      await expect(page.getByLabel('Country name')).toHaveValue(country);
    }
    await expect(page.getByLabel('Province', { exact: false })).toHaveCount(0);
    await expect(page.getByText(/Enter your billing and delivery addresses manually/)).toBeVisible();
    await page.locator('#trade-billing-street').fill('12 Test Road');
    await page.locator('#trade-billing-suburb').fill('Westlands');
    await page.locator('#trade-billing-postal-code').fill('00100');
    await page.locator('#trade-billing-city').fill('Nairobi');
    await page.getByLabel(/Use billing address for delivery/).check();
    await expect(page.locator('#trade-city')).toHaveValue('Nairobi');
    await page.getByRole('button', { name: 'Office Building', exact: true }).click();
    await page.getByRole('heading', { name: 'Billing and delivery addresses' }).locator('..')
      .screenshot({ path: `international-${country}-${test.info().project.name}.png` });
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Importer / distributor', exact: true }).click();
    await page.getByRole('button', { name: 'Art, craft & beads', exact: true }).click();
    await page.getByPlaceholder(/Gifts and party supplies sold/).fill('We distribute craft supplies to retail businesses.');
    await page.getByRole('button', { name: 'Submit application', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('We could not confirm whether your application was received.');
    await expect(page.getByRole('button', { name: 'Submit application', exact: true })).toBeDisabled();
    await expect(page.getByText('Test application intercepted')).toHaveCount(0);
    expect(application.country).toBe(country);
    expect(application.city).toBe('Nairobi');
    expect(application.province).toBeNull();
    expect(application.phone).toBe('+254712345678');
    expect(application.postalCode).toBe('00100');
    expect(application.companyAddress).toContain('Nairobi');
    expect(application.deliveryAddress).toContain('NAIROBI');
  });
}

test('country can switch from Other back to South Africa', async ({ page }) => {
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"validationOnly":true}' }));
  await page.goto('/');
  await page.getByPlaceholder('Name', { exact: true }).fill('Switch Test');
  await page.getByPlaceholder('Full contact name').fill('Browser Test');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByPlaceholder('name@business.co.za').fill('switch@protoe2e.co.za');
  await page.getByPlaceholder('+27').fill('0821234567');
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByPlaceholder('At least 10 characters').fill('SafeTest123!');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Change country', exact: true }).click();
  await page.getByRole('button', { name: 'Other country', exact: true }).click();
  await page.getByLabel('Country name').fill('Uganda');
  await page.getByRole('button', { name: 'South Africa', exact: true }).click();
  await expect(page.getByLabel('Country name')).toHaveCount(0);
  await expect(page.getByText('Country: South Africa', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change country', exact: true }).click();
  await expect(page.getByLabel('Province', { exact: false })).toBeVisible();
});
