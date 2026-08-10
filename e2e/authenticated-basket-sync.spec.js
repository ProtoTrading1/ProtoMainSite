import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000200';
const TEST_EMAIL = 'basket-sync-e2e@example.invalid';
const TEST_PASSWORD = 'SyntheticOnly123!';

const legacyProduct = product('E2E-LEGACY', 'Legacy Basket Item', 25);
const staleProduct = product('E2E-STALE', 'Stale Device Item', 30);
const markerProduct = product('E2E-MARKER', 'Cloud Sync Marker', 40);
const catalogue = [legacyProduct, staleProduct, markerProduct];

function product(id, name, price) {
  return {
    id,
    sku: id,
    code: id,
    name,
    price,
    stockOnHand: 100,
    stockQty: 100,
    inStock: true,
    minQty: 1,
    yearlySales: 10,
    categoryLabel: 'E2E Safety',
    categoryPath: [],
  };
}

function line(item, qty) {
  return { product: item, qty };
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

function tokenFor(user) {
  const base64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub: user.id, email: user.email, exp: now + 3600 })}.e2e`;
}

function installSyntheticServices(context, accountCart, safety) {
  return context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;

    if (pathname.endsWith('/mock-supabase/auth/v1/token')) {
      safety.authRequests += 1;
      const user = {
        id: ACCOUNT_ID,
        email: TEST_EMAIL,
        role: 'authenticated',
        aud: 'authenticated',
        last_sign_in_at: new Date().toISOString(),
      };
      return json(route, {
        access_token: tokenFor(user),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'synthetic-refresh-token',
        user,
      });
    }

    if (!pathname.startsWith('/api/')) return route.continue();

    if (/send-order|order-notify|send-reset-email|register-trade/.test(pathname)) {
      safety.destructiveRequests.push(`${request.method()} ${pathname}`);
      return json(route, { error: 'Blocked by basket E2E safety guard' }, 503);
    }

    if (pathname === '/api/customer-profile') {
      return json(route, {
        profile: {
          id: ACCOUNT_ID,
          email: TEST_EMAIL,
          name: 'Synthetic Basket Customer',
          company_name: 'Proto E2E Safety',
          role: 'customer',
          is_approved: true,
        },
      });
    }

    if (pathname === '/api/account-cart') {
      const method = request.method();
      const mutation = method === 'GET' ? null : request.postDataJSON();

      if (method === 'PUT' && mutation.mode === 'merge') {
        if (!accountCart.created) {
          accountCart.created = true;
          accountCart.items = mutation.items || [];
          accountCart.activityAt = mutation.activityAt || Date.now();
          accountCart.revision = 1;
        }
      } else if (method === 'PUT' && mutation.mode === 'save') {
        if (mutation.revision !== accountCart.revision) {
          return json(route, {
            error: 'A newer account basket is available',
            items: accountCart.items,
            activityAt: accountCart.activityAt,
            revision: accountCart.revision,
          }, 409);
        }
        accountCart.items = mutation.items;
        accountCart.activityAt = mutation.activityAt;
        accountCart.revision += 1;
      } else if (method === 'DELETE') {
        if (mutation.revision !== accountCart.revision) {
          return json(route, {
            error: 'A newer account basket is available',
            items: accountCart.items,
            activityAt: accountCart.activityAt,
            revision: accountCart.revision,
          }, 409);
        }
        accountCart.items = [];
        accountCart.activityAt = mutation.activityAt;
        accountCart.revision += 1;
      }

      return json(route, {
        items: accountCart.items,
        activityAt: accountCart.activityAt,
        revision: accountCart.revision,
      });
    }

    if (pathname === '/api/products') return json(route, catalogue);
    if (pathname === '/api/featured-products') {
      return json(route, { items: catalogue.map(({ sku }) => ({ sku })) });
    }
    if (pathname === '/api/taxonomy') return json(route, { categories: [] });
    if (pathname === '/api/stock') return json(route, { qty: 100, to_order: false });
    if (pathname === '/api/specials') return json(route, { specials: [] });
    if (pathname === '/api/banner') return json(route, null);
    if (pathname === '/api/popup-special') return json(route, null);
    if (pathname === '/api/sort-orders') return json(route, {});
    if (pathname.includes('/orders/last')) return json(route, { order: null });
    if (pathname === '/api/intercom/jwt') return json(route, { token: 'synthetic' });

    return json(route, {});
  });
}

async function seedLegacyBrowserBasket(page, items) {
  await page.addInitScript(({ seededItems }) => {
    localStorage.setItem('proto_cart', JSON.stringify(seededItems));
    localStorage.setItem('proto_cart_last_activity_at', String(Date.now() - 60_000));
    localStorage.removeItem('proto_cart_owner');
    sessionStorage.setItem('proto_welcome_dismissed', '1');
  }, { seededItems: items });
}

async function signIn(page, { dismissReminder = true } = {}) {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill(TEST_EMAIL);
  await dialog.locator('input[type="password"]').fill(TEST_PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Cloud Sync Marker', { exact: true }).first()).toBeVisible();
  // This suite exercises account-cart convergence, not the restored-basket
  // reminder. Dismiss the real post-login prompt so it cannot obscure or
  // shift the product action that follows on either viewport.
  const basketReminder = page.locator('.customer-journey-prompt--basket');
  await expect(basketReminder).toBeVisible();
  if (!dismissReminder) return basketReminder;
  await basketReminder.getByRole('button', {
    name: 'Close basket reminder and continue shopping',
  }).click();
  await expect(basketReminder).toBeHidden();
  return basketReminder;
}

async function storedCart(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart') || '[]'));
}

async function expectStoredSkus(page, expected) {
  await expect.poll(async () => (await storedCart(page)).map((item) => item.product.id))
    .toEqual(expected);
}

async function refreshFromAccount(page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('mobile restored-basket reminder yields to scrolling while the cart stays available', async ({ browser }) => {
  const accountCart = {
    created: true,
    items: [line(legacyProduct, 2)],
    activityAt: Date.now() - 60_000,
    revision: 1,
  };
  const safety = { authRequests: 0, destructiveRequests: [] };
  const context = await browser.newContext({ viewport: { width: 412, height: 640 }, isMobile: true, hasTouch: true });
  await installSyntheticServices(context, accountCart, safety);
  const page = await context.newPage();
  await seedLegacyBrowserBasket(page, accountCart.items);

  try {
    const basketReminder = await signIn(page, { dismissReminder: false });
    await page.evaluate(() => window.scrollTo(0, 160));
    await expect(basketReminder).toBeHidden();

    const cartButton = page.getByRole('button', { name: /^Cart\b/ });
    await expect(cartButton).toBeVisible();
    await cartButton.click();
    await expect(page.getByLabel('Your Order').getByRole('heading', { name: 'Legacy Basket Item' })).toBeVisible();
    expect(safety.destructiveRequests).toEqual([]);
  } finally {
    await context.close();
  }
});

test('desktop and mobile converge on the latest account basket without checkout', async ({ browser }) => {
  const accountCart = { created: false, items: [], activityAt: null, revision: 0 };
  const safety = { authRequests: 0, destructiveRequests: [] };
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const mobileContext = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  await installSyntheticServices(desktopContext, accountCart, safety);
  await installSyntheticServices(mobileContext, accountCart, safety);

  const desktop = await desktopContext.newPage();
  const mobile = await mobileContext.newPage();
  await seedLegacyBrowserBasket(desktop, [line(legacyProduct, 2)]);
  await seedLegacyBrowserBasket(mobile, [line(staleProduct, 7)]);

  try {
    // The first populated legacy browser establishes the account basket.
    await signIn(desktop);
    await expectStoredSkus(desktop, ['E2E-LEGACY']);
    expect(accountCart.items.map((item) => item.product.id)).toEqual(['E2E-LEGACY']);

    // A second, stale mobile basket must adopt the existing account version.
    await signIn(mobile);
    await expectStoredSkus(mobile, ['E2E-LEGACY']);
    expect(accountCart.items.map((item) => item.product.id)).toEqual(['E2E-LEGACY']);

    // A genuine desktop change saves a newer account revision.
    const markerCard = desktop.getByText('Cloud Sync Marker', { exact: true }).first().locator('xpath=ancestor::article');
    await markerCard.getByRole('button', { name: 'Add to Cart' }).click();
    await expect.poll(() => accountCart.items.map((item) => item.product.id))
      .toEqual(['E2E-LEGACY', 'E2E-MARKER']);

    // Mobile refreshes from the account and renders the same two products.
    await refreshFromAccount(mobile);
    await expectStoredSkus(mobile, ['E2E-LEGACY', 'E2E-MARKER']);
    // The visible badge is part of the mobile button's accessible name
    // (for example "Cart 3"), so match its stable leading action label.
    await mobile.getByRole('button', { name: /^Cart\b/ }).click();
    const mobileOrder = mobile.getByLabel('Your Order');
    await expect(mobileOrder.getByRole('heading', { name: 'Legacy Basket Item' })).toBeVisible();
    await expect(mobileOrder.getByRole('heading', { name: 'Cloud Sync Marker' })).toBeVisible();

    // A clear is also authoritative; an older desktop copy cannot resurrect it.
    await mobile.getByRole('button', { name: 'Clear order' }).click();
    await expect.poll(() => accountCart.items).toEqual([]);
    await refreshFromAccount(desktop);
    await expectStoredSkus(desktop, []);

    expect(safety.authRequests).toBe(2);
    expect(safety.destructiveRequests).toEqual([]);
  } finally {
    await Promise.allSettled([desktopContext.close(), mobileContext.close()]);
  }
});
