import { expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import process from 'node:process';

export const ACCOUNT_ID = '00000000-0000-4000-8000-000000000210';
export const TEST_EMAIL = 'accessibility-e2e@example.invalid';
export const TEST_PASSWORD = 'SyntheticOnly123!';
export const LOCAL_ORIGIN = `http://127.0.0.1:${Number(process.env.PROTO_PLAYWRIGHT_PORT || 4173)}`;

export const catalogueProducts = [
  { id: 'E2E-BLUE', sku: 'E2E-BLUE', code: 'E2E-BLUE', barcode: 'E2E-1001', name: 'NOTEBOOK | A5 | BLUE', title: 'NOTEBOOK | A5 | BLUE', price: 79.5, unitsOfIssue: 'Each' },
  { id: 'E2E-PINK', sku: 'E2E-PINK', code: 'E2E-PINK', barcode: 'E2E-1002', name: 'NOTEBOOK | A5 | PINK', title: 'NOTEBOOK | A5 | PINK', price: 79.5, unitsOfIssue: 'Each' },
  { id: 'E2E-PACK', sku: 'E2E-PACK', code: 'E2E-PACK', name: 'PENCILS | PACK OF 12', title: 'PENCILS | PACK OF 12', price: 24, unitsOfIssue: 'Pack of 12' },
].map((product) => ({ ...product, image: '/bag_black.png', stockOnHand: 100, stockQty: 100, inStock: true, minQty: 1, categoryLabel: 'Synthetic Accessibility', categoryPath: [] }));

export function syntheticSession() {
  const user = { id: ACCOUNT_ID, email: TEST_EMAIL, role: 'authenticated', aud: 'authenticated' };
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return {
    access_token: `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 })}.c3ludGhldGlj`,
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'synthetic-refresh-token', user,
  };
}

// Fixtures never contact a production service. Unknown APIs fail closed.
export async function installAccessibilityServices(context, { products = catalogueProducts, cartItems = [], lastOrder = null, safety = { blockedRequests: [] } } = {}) {
  const cart = { items: cartItems, activityAt: cartItems.length ? Date.now() : null, revision: 1 };
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.origin !== LOCAL_ORIGIN) return route.abort();
    if (path.endsWith('/mock-supabase/auth/v1/token')) return json(syntheticSession());
    if (path.endsWith('/mock-supabase/auth/v1/user')) return json(syntheticSession().user);
    if (path === '/mock-supabase/rest/v1/orders' && request.method() === 'GET') return json(lastOrder ? [lastOrder] : []);
    if (!path.startsWith('/api/')) {
      if (path.startsWith('/mock-supabase/')) return json({ error: 'Blocked synthetic service' }, 503);
      return route.continue();
    }
    if (path === '/api/customer-profile') return json({ profile: { id: ACCOUNT_ID, email: TEST_EMAIL, name: 'Synthetic Customer', role: 'customer', is_approved: true } });
    if (path === '/api/account-cart') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        if (body.mode === 'save') { cart.items = body.items; cart.activityAt = body.activityAt; cart.revision += 1; }
      }
      if (request.method() === 'DELETE') { cart.items = []; cart.revision += 1; }
      return json(cart);
    }
    if (path === '/api/products') return json(products);
    if (path === '/api/featured-products') return json({ items: products.map(({ sku }) => ({ sku })) });
    if (path === '/api/personalised-arrivals') return json({ suggestions: [] });
    if (path === '/api/taxonomy') return json({ categories: [] });
    if (path === '/api/stock') return json({ qty: 100, to_order: false });
    if (path === '/api/extended-range') return json({ products: [], total: 0, page: 1, pageSize: 24, catalogue: [], tiles: [] });
    if (path === '/api/specials') return json({ specials: [] });
    if (path === '/api/banner' || path === '/api/popup-special') return json(null);
    if (path === '/api/sort-orders') return json({});
    if (['/api/shopping-events', '/api/journey-analytics', '/api/presence', '/api/search-analytics', '/api/track-event'].includes(path)) return json({ ok: true });
    safety.blockedRequests.push(`${request.method()} ${path}`);
    return json({ error: 'Blocked by accessibility fixture' }, 503);
  });
  return safety;
}

export async function signInCatalogue(page) {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in/i }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' });
  await dialog.getByPlaceholder('name@business.co.za').fill(TEST_EMAIL);
  await dialog.locator('input[type="password"]').fill(TEST_PASSWORD);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.product-card').first()).toBeVisible();
}
