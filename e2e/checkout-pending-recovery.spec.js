import { expect, test } from '@playwright/test';
import { basketLineKey } from '../lib/basket-lines.mjs';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const original = { product: catalogueProducts[0], qty: 20, preference: 'Blue' };
const newer = { product: catalogueProducts[1], qty: 21, preference: 'Pink' };
const key = `proto_pending_checkout_v1:${ACCOUNT_ID}`;
const pending = () => ({ version: 1, customerId: ACCOUNT_ID,
  payload: { clientRef: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deliveryMethod: 'In store pick up', customerNotes: 'Original frozen notes', promoCode: null,
    items: [{ qty: 20, preference: 'Blue', product: { id: original.product.id, sku: original.product.sku, code: original.product.code, name: original.product.name, checkoutSnapshot: { unitPrice: 79.5, stockQty: 100 } } }] },
  items: [original], total: 1590, fingerprint: JSON.stringify([[basketLineKey(original), 20]]), options: { courierChoice: 'pickup', customerNotes: 'Original frozen notes', promo: null },
});

async function seedAndReload(page, record) {
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), { key, record });
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Could not send order' })).toBeVisible();
  await expect(page.locator('.product-card').first()).toBeVisible();
}

async function submitBasket(page) {
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Review order request', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Continue to options', exact: true }).click();
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  await page.getByRole('button', { name: /Pick up in store/ }).click();
  await page.getByRole('button', { name: 'Send order request — no payment now', exact: true }).click();
}

test('reload makes no automatic POST; explicit retry restores exact request and preserves a newer basket', async ({ page, context }) => {
  await installAccessibilityServices(context, { cartItems: [newer] });
  const posts = [];
  await context.route('**/api/send-order', async route => {
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orderId: 'synthetic-captured', orderNumber: 'TEST-OLD', emailDeliveryFailed: false }) });
  });
  await signInCatalogue(page);
  const record = pending(); await seedAndReload(page, record);
  expect(posts).toEqual([]);
  const dialog = page.getByRole('dialog', { name: 'Could not send order' });
  await expect(dialog.getByRole('button', { name: 'Check My Orders' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Order request received. Thank you.' })).toBeVisible();
  await expect(page.getByText('Your current basket was kept because it changed. Review the received order, then use Review current basket before submitting another order.', { exact: true })).toBeVisible();
  expect(posts).toEqual([record.payload]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).toMatchObject({ status: 'accepted', payload: record.payload });
  await page.getByRole('dialog').getByRole('button', { name: 'Review current basket', exact: true }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  await expect(page.locator('.order-drawer').filter({ visible: true }).first().getByRole('spinbutton', { name: `Quantity for ${newer.product.code} (Pink)`, exact: true })).toHaveValue('21');
});

test('accepted recovery result finishes after reload without another API request', async ({ page, context }) => {
  await installAccessibilityServices(context, { cartItems: [newer] });
  let posts = 0; await context.route('**/api/send-order', route => { posts++; return route.abort(); });
  await signInCatalogue(page);
  await seedAndReload(page, { ...pending(), result: { success: true, orderId: 'already-saved', orderNumber: 'TEST-SAVED' } });
  await page.getByRole('dialog').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Order request received. Thank you.' })).toBeVisible();
  expect(posts).toBe(0);
});

test('denied recovery storage prevents POST and exposes account-order resolution', async ({ page, context }) => {
  await installAccessibilityServices(context, { cartItems: [original] });
  let posts = 0; await context.route('**/api/send-order', route => { posts++; return route.abort(); });
  await signInCatalogue(page);
  await page.evaluate(() => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key) {
      if (key.startsWith('proto_pending_checkout_v1:')) throw new Error('Synthetic recovery denial');
      return getItem.call(this, key);
    };
  });
  await submitBasket(page);
  await expect(page.getByText(/cannot safely save or recover this order request/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check My Orders', exact: true })).toBeVisible();
  expect(posts).toBe(0);
});

test('an uncertain first submit saves intent before POST and explicit reload retry reuses it', async ({ page, context }) => {
  await installAccessibilityServices(context, { cartItems: [original] });
  const posts = []; let fail = true; let storedBeforePost;
  await context.route('**/api/send-order', async route => {
    posts.push(route.request().postDataJSON());
    storedBeforePost = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail
      ? { error: 'Synthetic uncertain response' }
      : { success: true, orderId: 'synthetic-recovered', orderNumber: 'TEST-RECOVERED' }) });
  });
  await signInCatalogue(page); await submitBasket(page);
  await expect(page.getByText('Synthetic uncertain response', { exact: true })).toBeVisible();
  expect(storedBeforePost.payload).toEqual(posts[0]);
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Could not send order' })).toBeVisible();
  expect(posts).toHaveLength(1);
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order request received. Thank you.' })).toBeVisible();
  expect(posts[1]).toEqual(posts[0]);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
});

test('fresh checkout stays blocked while an earlier request is unresolved', async ({ page, context }) => {
  await installAccessibilityServices(context, { cartItems: [newer] });
  const posts = []; await context.route('**/api/send-order', route => { posts.push(route.request().postDataJSON()); return route.abort(); });
  await signInCatalogue(page); await seedAndReload(page, pending());
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await submitBasket(page);
  await expect(page.getByText(/Your earlier order request still needs confirmation/)).toBeVisible();
  expect(posts).toEqual([]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).payload.clientRef, key)).toBe(pending().payload.clientRef);
});

test('confirmed first-dispatch rejection permits amendment with the original reference and conflicts direct the customer to My Orders', async ({ page, context }) => {
  await installAccessibilityServices(context, { cartItems: [newer] });
  const posts = []; await context.route('**/api/send-order', route => {
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Earlier payload was captured.', code: 'ORDER_REFERENCE_CONFLICT' }) });
  });
  await signInCatalogue(page); await seedAndReload(page, { ...pending(), status: 'pending', dispatchCount: 1,
    confirmedRejectedBeforeCapture: true, reviewRequired: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await submitBasket(page);
  await expect(page.getByText(/Check My Orders or contact Proto to resolve this request/)).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].clientRef).toBe(pending().payload.clientRef);
  expect(posts[0].items[0].product.id).toBe(newer.product.id);
  expect(posts[0].items[0].qty).toBe(newer.qty);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).payload.clientRef, key)).toBe(pending().payload.clientRef);
});
