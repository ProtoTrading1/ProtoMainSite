import { expect, test } from '@playwright/test';
import { parseCartMutation } from '../api/account-cart.js';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test('saved Instore copy uses a fresh authenticated Instore lookup despite a Main SKU collision', async ({ page, context }) => {
  const sku = 'E2E-SAME-SOURCE-SKU';
  const mainCollision = { ...catalogueProducts[0], id: sku, sku, code: sku, name: 'WRONG MAIN COLLISION', title: 'WRONG MAIN COLLISION', price: 250 };
  const savedInstore = { ...mainCollision, source: 'instore', isExtendedRange: true, name: 'SAVED INSTORE', title: 'SAVED INSTORE', price: 111 };
  const freshInstore = { ...savedInstore, name: 'FRESH INSTORE VERIFIED', title: 'FRESH INSTORE VERIFIED', price: 99 };
  const copyKey = `proto_cart_recovery:${ACCOUNT_ID}:independent-instore-source-copy`;
  const raw = JSON.stringify({ accountId: ACCOUNT_ID, items: [{ product: savedInstore, qty: 12, preference: 'Pink' }], type: 'save', intent: 'normal', activityAt: Date.now() - 10000, baseRevision: 1 });
  const safety = await installAccessibilityServices(context, { products: [...catalogueProducts, mainCollision] });
  await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await context.addInitScript(({ copyKey, raw }) => localStorage.setItem(copyKey, raw), { copyKey, raw });
  let cart = { items: [{ product: catalogueProducts[0], qty: 20 }], activityAt: Date.now(), revision: 1 };
  const writes = [];
  await context.route('**/api/account-cart', route => {
    const request = route.request();
    if (request.method() !== 'GET') {
      const mutation = parseCartMutation(request.postDataJSON(), { method: request.method() });
      if (mutation.mode !== 'merge') {
        writes.push(mutation);
        if (mutation.revision !== cart.revision) return route.fulfill({ status: 409, json: { ...cart, error: 'Synthetic revision conflict' } });
        cart = { items: mutation.items, activityAt: mutation.activityAt, revision: cart.revision + 1 };
      }
    }
    return route.fulfill({ json: cart });
  });
  const mainLookups = [];
  let restoring = false;
  await context.route('**/api/products?skus=*', route => {
    const wanted = new URL(route.request().url()).searchParams.get('skus');
    if (restoring) mainLookups.push(wanted);
    return route.fulfill({ json: [...catalogueProducts, mainCollision].filter(product => wanted.split(',').includes(product.id)) });
  });
  const instoreLookups = [];
  await context.route('**/api/extended-range?*', route => {
    const request = route.request();
    if (restoring) instoreLookups.push({ url: request.url(), authorization: request.headers().authorization });
    // A different pre-restore response ensures a cached catalogue cannot satisfy restoration.
    return route.fulfill({ json: { products: [], total: 0, page: 1, pageSize: 24, catalogue: restoring ? [freshInstore] : [], tiles: [] } });
  });
  let sends = 0;
  await context.route('**/api/send-order', route => { sends++; return route.abort(); });
  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.getByText('Pending basket copies need review', { exact: true })).toBeVisible();
  restoring = true;
  await drawer.getByRole('button', { name: 'Restore this copy', exact: true }).click();
  await expect.poll(() => cart.items[0]?.product?.name).toBe(freshInstore.name);
  await expect(drawer.getByRole('spinbutton', { name: `Quantity for ${sku} (Pink)`, exact: true })).toHaveValue('12');
  expect(cart.items).toHaveLength(1);
  expect(cart.items[0]).toMatchObject({ qty: 12, preference: 'Pink', product: { id: sku, sku, price: 99, source: 'instore', isExtendedRange: true } });
  expect(mainLookups.flatMap(value => value.split(','))).not.toContain(sku);
  expect(instoreLookups).toHaveLength(1);
  expect(new URL(instoreLookups[0].url).searchParams.get('catalogue')).toBe('1');
  expect(instoreLookups[0].authorization).toMatch(/^Bearer /);
  expect(writes).toHaveLength(1);
  expect(writes[0].revision).toBe(1);
  expect(cart.revision).toBe(2);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), copyKey)).toBeNull();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('proto_cart')))[0]).toMatchObject({ qty: 12, preference: 'Pink', product: { price: 99, source: 'instore', isExtendedRange: true } });
  expect(sends).toBe(0);
  expect(safety.blockedRequests).toEqual([]);
});
