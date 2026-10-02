// Local-only regressions derived from reproduced adversarial failures.
import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const copyKey = `proto_cart_device_copy_v1_${ACCOUNT_ID}`;
const draftKey = 'proto_registration_draft_v1';
const products = catalogueProducts.map(p => ({ ...p, price: 250 }));
const account = [{ product: products[0], qty: 15 }];
const local = [...account, { product: products[1], qty: 4 }];
const drawer = page => page.locator('.order-drawer').filter({ visible: true }).first();
const openBasket = async page => page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();

test('REGRESSION: logout cancels a discard queued behind another tab device-copy lock', async ({ page, context }) => {
  const safety = await installAccessibilityServices(context, { products, cartItems: account });
  await context.route('**/mock-supabase/auth/v1/logout*', route => route.fulfill({ status: 204, body: '' }));
  await context.addInitScript(({ local }) => {
    localStorage.setItem('proto_cart', JSON.stringify(local));
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now()));
  }, { local });
  await signInCatalogue(page);
  await openBasket(page);
  await drawer(page).getByRole('button', { name: 'Review device copy', exact: true }).click();
  await drawer(page).getByRole('button', { name: 'Discard device copy', exact: true }).click();
  await page.evaluate(async accountId => {
    let acquired;
    const started = new Promise(resolve => { acquired = resolve; });
    const hold = new Promise(resolve => { window.__releaseDeviceCopyLock = resolve; });
    window.__heldDeviceCopyLock = navigator.locks.request(`proto-device-copy-${accountId}`, async () => {
      acquired();
      await hold;
    });
    await started;
  }, ACCOUNT_ID);
  await drawer(page).getByRole('button', { name: 'Discard saved device copy', exact: true }).click();
  // Close the mobile focus trap before using the header's logout control.
  await page.keyboard.press('Escape');
  const logout = page.getByRole('button', { name: /^log out$/i }).filter({ visible: true }).first();
  if (!(await logout.isVisible())) await page.getByRole('button', { name: 'Categories', exact: true }).click();
  await logout.click();
  await expect(page.getByPlaceholder('Name', { exact: true })).toBeVisible();
  await page.evaluate(async accountId => {
    window.__releaseDeviceCopyLock();
    await window.__heldDeviceCopyLock;
    // Observe the queued callback finishing, rather than sampling before it runs.
    await navigator.locks.request(`proto-device-copy-${accountId}`, () => {});
  }, ACCOUNT_ID);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).items, copyKey)).toEqual(local);
  expect(safety.blockedRequests).toEqual([]);
});

test('REGRESSION: completed application exposes failed draft cleanup and retries removal truthfully', async ({ page, context }) => {
  const safety = await installAccessibilityServices(context);
  let applications = 0;
  await context.route('**/api/check-registration-email', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ exists: false, available: true }),
  }));
  await context.route('**/api/register-trade', route => {
    applications += 1;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ instantAccess: false }) });
  });
  await context.addInitScript(({ draftKey }) => {
    sessionStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), values: {
      companyName: 'Synthetic completion company', contactName: 'Synthetic completion contact',
      email: 'completion@protoe2e.co.za', phone: '0821234567', whatsappOptIn: false,
      country: 'South Africa', province: 'Gauteng', step: 3,
      billingStreet: '12 Synthetic Road', billingSuburb: 'Synthetic suburb',
      billingCity: 'Synthetic City', billingPostalCode: '0001', deliverySameAsBilling: true,
      streetName: '12 Synthetic Road', suburb: 'Synthetic suburb', city: 'Synthetic City', postalCode: '0001',
      buildingType: 'Office Building', tradingChannels: ['Importer / distributor'],
      productCategories: ['Art, craft & beads'], businessDescription: 'Synthetic supplies for disposable browser tests.',
    } }));
    window.__allowDraftCleanup = false;
    const originalRemove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (this === sessionStorage && key === draftKey && !window.__allowDraftCleanup) {
        throw new Error('Synthetic denied draft cleanup');
      }
      return originalRemove.call(this, key);
    };
  }, { draftKey });
  await page.goto('/');
  await page.getByRole('button', { name: 'Restore application details', exact: true }).click();
  await page.getByPlaceholder('At least 8 characters').fill('SyntheticCompletion123!');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Billing and delivery addresses' })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Submit application', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Application received', exact: true })).toBeVisible();
  const warning = page.getByRole('alert').filter({ hasText: 'could not remove your saved details' });
  await expect(warning).toBeVisible();
  expect(await page.evaluate(key => sessionStorage.getItem(key), draftKey)).not.toBeNull();
  const retry = page.getByRole('button', { name: 'Remove saved application details', exact: true });
  await retry.click();
  await expect(warning).toBeVisible();
  await page.evaluate(() => { window.__allowDraftCleanup = true; });
  await retry.click();
  await expect(warning).toHaveCount(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), draftKey)).toBeNull();
  expect(applications).toBe(1);
  expect(safety.blockedRequests).toEqual([]);
});

test('REGRESSION: corrupt saved copy is archived before a valid copy is adopted', async ({ page, context }) => {
  await installAccessibilityServices(context, { products, cartItems: account });
  await context.addInitScript(({ local, copyKey }) => {
    localStorage.setItem('proto_cart', JSON.stringify(local));
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now()));
    localStorage.setItem(copyKey, '{broken');
  }, { local, copyKey });
  await signInCatalogue(page);
  await openBasket(page);
  await expect(drawer(page).getByRole('button', { name: 'Review device copy', exact: true })).toBeVisible();
  await expect(drawer(page).locator('[data-cart-product-id]')).toHaveCount(1);
  const stored = await page.evaluate(key => ({ copy: JSON.parse(localStorage.getItem(key)), archives: Object.keys(localStorage).filter(k => k.startsWith(key + '_unreadable_')).map(k => localStorage.getItem(k)) }), copyKey);
  expect(stored.copy.items).toEqual(local);
  expect(stored.archives).toEqual(['{broken']);
  await drawer(page).screenshot({ path: `../preview-evidence/critical-corrupt-copy-${test.info().project.name}.png` });
});

test('REGRESSION: stale discard confirmation preserves a newer cross-tab copy', async ({ page, context }) => {
  await installAccessibilityServices(context, { products, cartItems: account });
  await context.addInitScript(({ local }) => {
    if (!localStorage.getItem('proto_cart')) {
      localStorage.setItem('proto_cart', JSON.stringify(local));
      localStorage.setItem('proto_cart_last_activity_at', String(Date.now()));
    }
  }, { local });
  await signInCatalogue(page);
  await openBasket(page);
  await drawer(page).getByRole('button', { name: 'Review device copy', exact: true }).click();
  await drawer(page).getByRole('button', { name: 'Discard device copy', exact: true }).click();
  // Another real tab discards the old copy through the UI, then the app
  // preserves a different synthetic legacy basket through normal hydration.
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.locator('.product-card').first()).toBeVisible();
  await openBasket(other);
  await drawer(other).getByRole('button', { name: 'Review device copy', exact: true }).click();
  await drawer(other).getByRole('button', { name: 'Discard device copy', exact: true }).click();
  await drawer(other).getByRole('button', { name: 'Discard saved device copy', exact: true }).click();
  await other.evaluate(({ local }) => {
    local[1].qty = 99;
    localStorage.setItem('proto_cart', JSON.stringify(local));
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now()));
  }, { local });
  await other.reload();
  await expect(other.locator('.product-card').first()).toBeVisible();
  await openBasket(other);
  await drawer(other).getByRole('button', { name: 'Review device copy', exact: true }).click();
  await expect(drawer(other).getByRole('table')).toContainText('99');
  await expect(drawer(page).getByRole('table')).not.toContainText('99');
  await drawer(page).getByRole('button', { name: 'Discard saved device copy', exact: true }).click();
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), copyKey)).items[1].qty).toBe(99);
  await expect(drawer(page).getByRole('table')).toContainText('99');
  await expect(drawer(page).getByRole('button', { name: 'Discard device copy', exact: true })).toBeVisible();
  await drawer(page).getByRole('button', { name: 'Discard device copy', exact: true }).click();
  await drawer(page).getByRole('button', { name: 'Discard saved device copy', exact: true }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), copyKey)).toBeNull();
  await expect(drawer(page).locator('[data-cart-product-id]')).toHaveCount(1);
});

test('REGRESSION: failed draft deletion remains visible and can be retried', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await context.addInitScript(({ key }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), values: { companyName: 'Synthetic private company', contactName: 'Synthetic contact', email: 'critical@protoe2e.co.za', step: 1 } }));
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (name) {
      if (name === key && !window.criticalAllowDraftDelete) throw new DOMException('Synthetic remove failure', 'SecurityError');
      return remove.call(this, name);
    };
  }, { key: draftKey });
  await page.goto('/');
  await page.getByRole('button', { name: 'Discard saved application', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore application details', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('could not be discarded');
  expect(await page.evaluate(key => sessionStorage.getItem(key), draftKey)).toContain('Synthetic private company');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore application details', exact: true })).toBeVisible();
  await page.evaluate(() => { window.criticalAllowDraftDelete = true; });
  await page.getByRole('button', { name: 'Discard saved application', exact: true }).click();
  expect(await page.evaluate(key => sessionStorage.getItem(key), draftKey)).toBeNull();
  await expect(page.getByRole('button', { name: 'Restore application details', exact: true })).toHaveCount(0);
});

test('REGRESSION: erasing all draft identity fields removes their saved values', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await page.goto('/');
  await page.getByPlaceholder('Name', { exact: true }).fill('Synthetic erased company');
  await page.getByPlaceholder('Full contact name').fill('Synthetic erased contact');
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), draftKey)).toContain('Synthetic erased contact');
  await page.getByPlaceholder('Name', { exact: true }).fill('');
  await page.getByPlaceholder('Full contact name').fill('');
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), draftKey)).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Restore application details', exact: true })).toHaveCount(0);
  await expect(page.getByPlaceholder('Full contact name')).toHaveValue('');
});

test('REGRESSION: closing before SDK JSON processing cannot commit a shared session', async ({ page, context }) => {
  await installAccessibilityServices(context);
  await context.addInitScript(() => {
    const json = Response.prototype.json;
    Response.prototype.json = async function () {
      const value = await json.call(this);
      if (value?.access_token) {
        window.criticalTokenDecoded = true;
        await new Promise(resolve => { window.criticalReleaseToken = resolve; });
      }
      return value;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill('critical@protoe2e.co.za');
  await dialog.locator('input[type=password]').fill('SyntheticCritical123!');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.criticalTokenDecoded === true)).toBe(true);
  await dialog.getByRole('button', { name: 'Close sign-in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /^sb-.*-auth-token$/.test(key)))).toBe(false);
  await page.evaluate(() => window.criticalReleaseToken());
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /^sb-.*-auth-token$/.test(key)))).toBe(false);
  await expect(page.locator('.product-card').first()).toHaveCount(0);
  await page.screenshot({ path: `../preview-evidence/critical-late-login-${test.info().project.name}.png`, fullPage: true });
});

test('GUARANTEE: stale email response cannot approve the changed email', async ({ page, context }) => {
  await installAccessibilityServices(context);
  let releaseOld;
  const gate = new Promise(resolve => { releaseOld = resolve; });
  let oldStarted = false;
  await context.route('**/api/check-registration-email', async route => {
    const body = route.request().postDataJSON();
    if (body.email === 'old@protoe2e.co.za') {
      oldStarted = true;
      await gate;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ exists: false, available: true }) });
    } else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ exists: true, available: false }) });
  });
  await page.goto('/');
  await page.getByPlaceholder('Name', { exact: true }).fill('Synthetic company');
  await page.getByPlaceholder('Full contact name').fill('Synthetic contact');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const email = page.getByPlaceholder('name@business.co.za');
  await email.fill('old@protoe2e.co.za');
  await page.getByPlaceholder('+27').focus();
  await expect.poll(() => oldStarted).toBe(true);
  await email.fill('new@protoe2e.co.za');
  await page.getByPlaceholder('+27').focus();
  await expect(page.getByRole('status').filter({ hasText: 'This email is already registered.' })).toBeVisible();
  releaseOld();
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Email available' })).toHaveCount(0);
});

test('GUARANTEE: rapid login clicks send one password request and close before response keeps session empty', async ({ page, context }) => {
  await installAccessibilityServices(context);
  let requests = 0;
  await context.route('**/mock-supabase/auth/v1/token*', () => {
    requests += 1;
    return new Promise(() => {});
  });
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill('critical@protoe2e.co.za');
  await dialog.locator('input[type=password]').fill('SyntheticCritical123!');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).dblclick();
  await expect.poll(() => requests).toBe(1);
  await expect(dialog.getByRole('button', { name: /Signing in/ })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close sign-in', exact: true }).click();
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => /^sb-.*-auth-token$/.test(key)))).toBe(false);
});
