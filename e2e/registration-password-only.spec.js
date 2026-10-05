import { expect, test } from '@playwright/test';

const WEAK = 'This password is too weak. Please choose a stronger, unique password.';
const PRIVATE = 'PRIVATE_PROVIDER_REASON';
const FIRST_PASSWORD = 'synthetic-first-password';
const STRONGER_PASSWORD = 'synthetic-stronger-password';
const EMAIL = 'synthetic@fixture.invalid';
const RECEIPT = { ok: true, receipt: 'CHECK_EMAIL_OR_SIGN_IN', instantAccess: false, emailVerificationRequired: true };
const REJECTION = { error: 'Choose a stronger password before submitting again.', code: 'REGISTRATION_PASSWORD_REJECTED', fieldErrors: { password: WEAK } };

async function services(page) {
  const evidence = { applications: [], followUps: [], pageErrors: [], consoleErrors: [] };
  page.on('pageerror', error => evidence.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') evidence.consoleErrors.push(message.text()); });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) {
      if (url.pathname.startsWith('/mock-supabase/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return route.continue();
    }
    if (url.pathname === '/api/register-trade') evidence.applications.push(request.postDataJSON());
    if (['/api/resend-trade-verification', '/api/send-reset-email', '/api/do-reset-password', '/api/trade-ownership'].includes(url.pathname)) evidence.followUps.push(url.pathname);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.pathname === '/api/check-registration-email' ? { ok: true, validationOnly: true } : RECEIPT) });
  });
  return evidence;
}
async function complete(page) {
  await page.goto('/');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.locator('#trade-company-name').fill('Synthetic Trade');
  await page.locator('#trade-contact-name').fill('Synthetic Applicant');
  await page.locator('#trade-vat-number').fill('Synthetic VAT');
  await page.locator('#trade-customer-code').fill('SYN777');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('#trade-email').fill(EMAIL);
  await page.locator('#trade-phone').fill('+27825550123');
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.locator('#trade-new-password').fill(FIRST_PASSWORD);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Billing and delivery addresses' })).toBeVisible();
  for (const [id, value] of [['trade-billing-street', '1 Fixture Road'], ['trade-billing-suburb', 'Fixture Suburb'], ['trade-billing-city', 'Fixture City'], ['trade-billing-postal-code', '0001']]) await page.locator(`#${id}`).fill(value);
  await page.getByLabel(/Use billing address for delivery/).check();
  await page.getByRole('button', { name: 'House', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Physical retail store', exact: true }).click();
  await page.getByRole('button', { name: 'Art, craft & beads', exact: true }).click();
  await page.getByPlaceholder(/Gifts and party supplies sold/).fill('Synthetic gifts supplied to local shops.');
  await expect(page.getByRole('button', { name: 'Submit application', exact: true })).toBeEnabled();
}
async function capture(page, testInfo, name) {
  await page.waitForFunction(() => [...document.querySelectorAll('.lp-quiz-step')].every(element => Number(getComputedStyle(element.parentElement).opacity) > 0.99));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: false });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
function safeBrowser(evidence) {
  expect(evidence.pageErrors).toEqual([]);
  expect(evidence.consoleErrors.filter(message => !/Failed to load resource: net::ERR_FAILED|Failed to load resource: the server responded with a status of (422|503)/.test(message))).toEqual([]);
  expect(evidence.consoleErrors.join('\n')).not.toMatch(new RegExp(`${PRIVATE}|${FIRST_PASSWORD}|${STRONGER_PASSWORD}`));
  expect(evidence.followUps).toEqual([]);
}

test('weak password returns to Contact, retains all other entries, clears the secret and allows only explicit stronger retry', async ({ page }, testInfo) => {
  const evidence = await services(page); const requests = [];
  await page.route('**/api/register-trade', route => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: requests.length === 1 ? 422 : 200, contentType: 'application/json', body: JSON.stringify(requests.length === 1 ? REJECTION : RECEIPT) });
  });
  await complete(page);
  await page.getByRole('button', { name: 'Submit application', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add the account and contact details.' })).toBeVisible();
  const summary = page.locator('.lp-register-error-summary');
  await expect(summary).toBeFocused(); await expect(summary).toContainText(WEAK);
  await expect(page.locator('#trade-new-password')).toHaveValue('');
  await expect(page.locator('#trade-new-password')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#trade-new-password-error')).toHaveText(WEAK);
  await expect(page.locator('#trade-email')).toHaveValue(EMAIL);
  await expect(page.locator('#trade-phone')).toHaveValue('+27825550123');
  await expect(page.getByRole('button', { name: /No WhatsApp updates$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Check your email or sign in' })).toHaveCount(0);
  await expect(page.getByText(/you (?:are|have) already registered/i)).toHaveCount(0);
  expect(requests.length).toBe(1);
  await summary.getByRole('link', { name: WEAK, exact: true }).click();
  await expect(page.locator('#trade-new-password')).toBeFocused();
  await capture(page, testInfo, 'password-rejected-contact');
  await page.locator('#trade-new-password').fill('x');
  await expect(page.locator('#trade-new-password-error')).toContainText('10 characters');
  await expect(page.getByText(WEAK, { exact: true })).toHaveCount(0);
  await page.locator('#trade-new-password').fill('');
  await expect(page.locator('#trade-new-password-error')).toContainText('Create a password');
  await expect(page.getByText(WEAK, { exact: true })).toHaveCount(0);
  await page.locator('#trade-new-password').fill(STRONGER_PASSWORD);
  await expect(page.locator('#trade-new-password-error')).toHaveCount(0);
  await page.getByRole('button', { name: /Back$/, exact: false }).click();
  await expect(page.locator('#trade-company-name')).toHaveValue('Synthetic Trade');
  await expect(page.locator('#trade-contact-name')).toHaveValue('Synthetic Applicant');
  await expect(page.locator('#trade-vat-number')).toHaveValue('Synthetic VAT');
  await expect(page.locator('#trade-customer-code')).toHaveValue('SYN777');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('#trade-billing-street')).toHaveValue('1 Fixture Road');
  await expect(page.locator('#trade-billing-suburb')).toHaveValue('Fixture Suburb');
  await expect(page.locator('#trade-billing-city')).toHaveValue('Fixture City');
  await expect(page.locator('#trade-billing-postal-code')).toHaveValue('0001');
  await expect(page.getByLabel(/Use billing address for delivery/)).toBeChecked();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Physical retail store', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Art, craft & beads', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByPlaceholder(/Gifts and party supplies sold/)).toHaveValue('Synthetic gifts supplied to local shops.');
  expect(requests.length).toBe(1);
  await page.getByRole('button', { name: 'Submit application', exact: true }).click();
  const receipt = page.getByRole('region', { name: 'Check your email or sign in' });
  await expect(receipt).toBeVisible(); await expect(receipt).toBeFocused();
  expect(requests.length).toBe(2);
  expect(requests[1]).toEqual({ ...requests[0], password: STRONGER_PASSWORD });
  const storage = await page.evaluate(() => ({ session: { ...sessionStorage }, local: { ...localStorage } }));
  expect(JSON.stringify(storage)).not.toMatch(new RegExp(`${FIRST_PASSWORD}|${STRONGER_PASSWORD}|${EMAIL}`));
  await capture(page, testInfo, 'password-explicit-retry-receipt');
  safeBrowser(evidence);
});

test('slow password rejection locks changes and duplicate clicks while one request is pending', async ({ page }, testInfo) => {
  const evidence = await services(page); let applications = 0; let release; let entered;
  const started = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/register-trade', async route => { applications++; entered(); await gate; await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify(REJECTION) }); });
  await complete(page); await page.getByRole('button', { name: 'Submit application', exact: true }).click(); await started;
  const pendingButton = page.locator('.lp-quiz-next');
  await expect(pendingButton).toBeDisabled();
  await expect(page.getByPlaceholder(/Gifts and party supplies sold/)).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Submitting your application' })).toBeVisible();
  await pendingButton.click({ force: true });
  expect(applications).toBe(1); await capture(page, testInfo, 'password-slow-request-pending');
  release();
  await expect(page.locator('.lp-register-error-summary')).toContainText(WEAK);
  await expect(page.locator('#trade-new-password')).toHaveValue(''); expect(applications).toBe(1);
  safeBrowser(evidence);
});

for (const outcome of ['new success', 'neutral duplicate']) {
  test(`${outcome} keeps the existing neutral receipt and has no automatic reset, resend or second application`, async ({ page }, testInfo) => {
    const evidence = await services(page); await complete(page);
    await page.getByRole('button', { name: 'Submit application', exact: true }).click();
    const receipt = page.getByRole('region', { name: 'Check your email or sign in' });
    await expect(receipt).toBeVisible(); await expect(receipt).toBeFocused();
    await expect(receipt).toContainText('If this is a new application');
    await expect(receipt).not.toContainText('account has been created');
    await expect(receipt).not.toContainText(WEAK);
    await expect(receipt).not.toContainText('You are already registered');
    expect(evidence.applications.length).toBe(1);
    await capture(page, testInfo, outcome.replaceAll(' ', '-'));
    await page.reload(); await expect(page.locator('#trade-company-name')).toBeVisible();
    expect(evidence.applications.length).toBe(1); safeBrowser(evidence);
  });
}

for (const outcome of ['lost request', 'unknown 503', 'malformed weak envelope', 'malformed success']) {
  test(`${outcome} holds submission across refresh without precise password feedback or automatic retry`, async ({ page }, testInfo) => {
    const evidence = await services(page); let applications = 0;
    await page.route('**/api/register-trade', route => {
      applications++;
      if (outcome === 'lost request') return route.abort('failed');
      const status = outcome === 'unknown 503' ? 503 : outcome === 'malformed weak envelope' ? 422 : 200;
      const body = outcome === 'unknown 503' ? { error: PRIVATE } : outcome === 'malformed weak envelope' ? { ...REJECTION, fieldErrors: { password: PRIVATE } } : { ok: true };
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await complete(page); await page.getByRole('button', { name: 'Submit application', exact: true }).click();
    const notice = page.locator('.lp-register-submit-notice');
    await expect(notice).toContainText('Application result not confirmed'); await expect(notice).toBeFocused();
    await expect(notice).not.toContainText(PRIVATE); await expect(page.getByText(WEAK, { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit application', exact: true })).toBeDisabled();
    await expect(page.getByPlaceholder(/Gifts and party supplies sold/)).toHaveValue('Synthetic gifts supplied to local shops.');
    expect(applications).toBe(1); await capture(page, testInfo, outcome.replaceAll(' ', '-'));
    await page.reload(); await expect(page.getByRole('alert')).toContainText('earlier application');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    expect(applications).toBe(1); safeBrowser(evidence);
  });
}
