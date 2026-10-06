import { expect, test } from '@playwright/test';
import { parseCartMutation } from '../api/account-cart.js';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

for (const change of ['quantity edit', 'remote price-only revision']) {
test(`late recovery-copy lookup preserves a newer ${change} and original evidence`, async ({ page, context }) => {
  const currentProduct = catalogueProducts[0];
  const recoveredProduct = catalogueProducts[1];
  const copyKey = `proto_cart_recovery:${ACCOUNT_ID}:independent-deferred-copy`;
  const otherKey = 'proto_cart_recovery:synthetic-other-account:protected';
  const raw = JSON.stringify({ accountId: ACCOUNT_ID, items: [{ product: recoveredProduct, qty: 24, preference: 'Pink' }],
    type: 'save', intent: 'normal', activityAt: Date.now() - 10000, baseRevision: 1 });
  const safety = await installAccessibilityServices(context);
  await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await context.addInitScript(({ copyKey, otherKey, raw }) => {
    localStorage.setItem(copyKey, raw);
    localStorage.setItem(otherKey, 'protected-synthetic-evidence');
  }, { copyKey, otherKey, raw });

  let cart = { items: [{ product: currentProduct, qty: 20 }], activityAt: Date.now(), revision: 1 };
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
  let sends = 0;
  await context.route('**/api/send-order', route => { sends++; return route.abort(); });

  await signInCatalogue(page);
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  await expect(drawer.getByText('Pending basket copies need review', { exact: true })).toBeVisible();
  const restore = drawer.getByRole('button', { name: 'Restore this copy', exact: true });
  await expect(restore).toBeEnabled();

  let release;
  let lookups = 0;
  let liveCurrentProduct = currentProduct;
  const held = new Promise(resolve => { release = resolve; });
  await context.route('**/api/products?skus=*', async route => {
    const wanted = new URL(route.request().url()).searchParams.get('skus');
    if (wanted === currentProduct.id) return route.fulfill({ json: [liveCurrentProduct] });
    if (wanted !== recoveredProduct.id) return route.fallback();
    lookups++;
    await held;
    return route.fulfill({ json: [recoveredProduct] });
  });
  await restore.click();
  await expect.poll(() => lookups).toBe(1);

  const quantity = drawer.getByRole('spinbutton', { name: `Quantity for ${currentProduct.code}`, exact: true });
  await expect(quantity).toBeEnabled();
  const expectedQty = change === 'quantity edit' ? 21 : 20;
  if (change === 'quantity edit') {
    await quantity.fill('21');
    await quantity.blur();
    await expect.poll(() => cart.items[0]?.qty).toBe(21);
  } else {
    liveCurrentProduct = { ...currentProduct, price: 99 };
    cart = { items: [{ product: liveCurrentProduct, qty: 20 }], activityAt: Date.now(), revision: cart.revision + 1 };
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart'))?.[0]?.product?.price)).toBe(99);
    await expect(drawer.locator(`[data-cart-product-id="${currentProduct.id}"] .drawer-line-footer strong`)).toHaveText('R1980.00');
  }
  await expect.poll(() => page.evaluate(accountId => localStorage.getItem(`proto_cart_pending_${accountId}`), ACCOUNT_ID)).toBeNull();
  const before = await page.evaluate(accountId => ({ cart: localStorage.getItem('proto_cart'),
    pending: localStorage.getItem(`proto_cart_pending_${accountId}`), checkout: localStorage.getItem(`proto_pending_checkout_v1:${accountId}`) }), ACCOUNT_ID);
  const committedWrites = writes.length;

  const response = page.waitForResponse(reply => new URL(reply.url()).searchParams.get('skus') === recoveredProduct.id);
  release();
  await (await response).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const after = await page.evaluate(accountId => ({ cart: localStorage.getItem('proto_cart'),
    pending: localStorage.getItem(`proto_cart_pending_${accountId}`), checkout: localStorage.getItem(`proto_pending_checkout_v1:${accountId}`) }), ACCOUNT_ID);
  expect(after).toEqual(before);
  expect(cart.items.map(item => [item.product.id, item.qty])).toEqual([[currentProduct.id, expectedQty]]);
  expect(writes).toHaveLength(committedWrites);
  expect(writes.some(write => write.items.some(item => item.product.id === recoveredProduct.id))).toBe(false);
  await expect(quantity).toHaveValue(String(expectedQty));
  await expect(drawer.getByText('Pending basket copies need review', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), copyKey)).toBe(raw);
  expect(await page.evaluate(key => localStorage.getItem(key), otherKey)).toBe('protected-synthetic-evidence');
  expect(sends).toBe(0);
  expect(safety.blockedRequests).toEqual([]);
});
}
