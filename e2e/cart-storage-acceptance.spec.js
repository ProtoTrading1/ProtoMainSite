import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, syntheticSession } from './helpers/accessibility-services.js';

const copyKey = `proto_cart_device_copy_v1_${ACCOUNT_ID}`;
const products = catalogueProducts.map(product => ({ ...product, price: 250 }));
const account = [{ product: products[0], qty: 15 }];
const local = [...account, { product: products[1], qty: 4, preference: 'Synthetic blue' }];
const app = page => page.locator('#storage-acceptance-app');
const basket = page => app(page).locator('.order-drawer').filter({ visible: true }).first();

async function mountIsolatedApp(page, { canonical = null, copyRaw = null, denyGetter = false, denyArchive = false } = {}) {
  await page.goto('/');
  await page.evaluate(async settings => {
    const [react, dom, { default: App }, { default: Boundary }, { rememberAuthSession }, { supabase }]
      = await Promise.all([import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
        import('/src/App.jsx'), import('/src/components/PortalErrorBoundary.jsx'),
        import('/src/lib/authHeaders.js'), import('/src/lib/supabase.js')]);
    await supabase.auth.initialize();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Request-local auth avoids SDK session events mounting a second portal.
    rememberAuthSession(settings.session);
    window.__testStorage = window.localStorage;
    if (settings.canonical !== null) window.__testStorage.setItem('proto_cart', settings.canonical);
    if (settings.copyRaw !== null) window.__testStorage.setItem(settings.copyKey, settings.copyRaw);
    if (settings.denyArchive) {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('proto_cart_unreadable_')) throw new DOMException('Synthetic archive quota', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    }
    if (settings.denyGetter) {
      Object.defineProperty(window, 'localStorage', { configurable: true,
        get() { throw new DOMException('Synthetic storage property denied', 'SecurityError'); } });
    }
    const React = react.default ?? react;
    const DOM = dom.default ?? dom;
    const container = document.createElement('div');
    container.id = 'storage-acceptance-app';
    document.body.appendChild(container);
    DOM.createRoot(container).render(React.createElement(Boundary, null,
      React.createElement(App, { customer: { id: settings.accountId, name: 'Synthetic acceptance customer',
        email: 'storage-acceptance@example.invalid', role: 'customer', is_approved: true } })));
  }, { canonical, copyRaw, denyGetter, denyArchive, copyKey, accountId: ACCOUNT_ID, session: syntheticSession() });
  await expect(app(page).locator('.product-card').first()).toBeVisible();
}

async function openBasket(page) {
  await app(page).locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(basket(page)).toBeVisible();
}

async function stored(page, key) {
  return page.evaluate(name => window.__testStorage.getItem(name), key);
}

test('denied storage property leaves catalogue and confirmed account basket usable with a warning', async ({ page, context }) => {
  const safety = await installAccessibilityServices(context, { products, cartItems: account });
  await mountIsolatedApp(page, { denyGetter: true });
  await openBasket(page);
  await expect(basket(page).locator('[data-cart-product-id]')).toHaveCount(1);
  await expect(basket(page).getByRole('alert')).toContainText('cart_device_storage');
  await expect(app(page).getByText('Portal error recovered', { exact: true })).toHaveCount(0);
  expect(safety.blockedRequests).toEqual([]);
});

test('malformed canonical basket is archived exactly before account basket adoption', async ({ page, context }) => {
  const safety = await installAccessibilityServices(context, { products, cartItems: account });
  await mountIsolatedApp(page, { canonical: '[null]' });
  await openBasket(page);
  await expect(basket(page).locator('[data-cart-product-id]')).toHaveCount(1);
  await expect.poll(() => stored(page, 'proto_cart')).toBe(JSON.stringify(account));
  const archives = await page.evaluate(() => Object.keys(window.__testStorage)
    .filter(key => key.startsWith('proto_cart_unreadable_')).map(key => window.__testStorage.getItem(key)));
  expect(archives).toEqual(['[null]']);
  await expect(app(page).getByText('Portal error recovered', { exact: true })).toHaveCount(0);
  expect(safety.blockedRequests).toEqual([]);
});

test('malformed saved-copy display data is archived and valid device quantities remain reviewable', async ({ page, context }) => {
  const safety = await installAccessibilityServices(context, { products, cartItems: account });
  const raw = JSON.stringify({ accountId: ACCOUNT_ID, items: [{ product: { id: 'SYNTHETIC', name: { invalid: true } }, qty: 1 }] });
  await mountIsolatedApp(page, { canonical: JSON.stringify(local), copyRaw: raw });
  await openBasket(page);
  await expect(basket(page).locator('[data-cart-product-id]')).toHaveCount(1);
  await basket(page).getByRole('button', { name: 'Review device copy', exact: true }).click();
  const pink = basket(page).getByRole('row').filter({ hasText: 'E2E-PINK' });
  await expect(pink.locator('td').first()).toHaveText('4');
  await expect(pink).toContainText('Synthetic blue');
  const copy = JSON.parse(await stored(page, copyKey));
  expect(copy.items).toEqual(local);
  const archives = await page.evaluate(key => Object.keys(window.__testStorage)
    .filter(name => name.startsWith(`${key}_unreadable_`)).map(name => window.__testStorage.getItem(name)), copyKey);
  expect(archives).toEqual([raw]);
  await expect(app(page).getByText('Portal error recovered', { exact: true })).toHaveCount(0);
  expect(safety.blockedRequests).toEqual([]);
});

test('failed canonical archive retains raw bytes and blocks account adoption and writes', async ({ page, context }) => {
  const safety = await installAccessibilityServices(context, { products, cartItems: account });
  const accountRequests = [];
  context.on('request', request => {
    if (new URL(request.url()).pathname === '/api/account-cart') accountRequests.push(request.method());
  });
  await mountIsolatedApp(page, { canonical: '[null]', denyArchive: true });
  await openBasket(page);
  await expect(basket(page).getByRole('alert')).toContainText('cart_device_storage');
  await expect(basket(page).locator('[data-cart-product-id]')).toHaveCount(0);
  await expect(basket(page).getByRole('button', { name: 'Review order request', exact: true })).toHaveCount(0);
  await basket(page).getByRole('button', { name: 'Retry account basket sync', exact: true }).click();
  expect(await stored(page, 'proto_cart')).toBe('[null]');
  expect(accountRequests).toEqual([]);
  await expect(app(page).getByText('Portal error recovered', { exact: true })).toHaveCount(0);
  expect(safety.blockedRequests).toEqual([]);
});
