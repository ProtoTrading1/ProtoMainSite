import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

// Mounted browser proof only: every service is intercepted; no provider or DB.
test.setTimeout(45000);
const pendingKey = `proto_pending_checkout_v1:${ACCOUNT_ID}`;
const queen = { ...catalogueProducts[0], id: 'TK2154-GLD', sku: 'TK2154-GLD', code: 'TK2154-GLD', name: 'Queen', title: 'Queen', price: 428, source: 'main' };
const princess = { ...catalogueProducts[1], id: 'TK2120-GLD', sku: 'TK2120-GLD', code: 'TK2120-GLD', name: 'Princess', title: 'Princess', price: 355, source: 'main' };
const survivor = { ...catalogueProducts[2], price: 500, source: 'main' };
const products = [queen, princess, survivor];
const items = products.map(product => ({ product, qty: 3 }));

async function submitBasket(page) {
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Review order request', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Continue to options', exact: true }).click();
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  await page.getByRole('button', { name: /Pick up in store/ }).click();
  await page.getByRole('button', { name: /Send order request.*no payment now/ }).click();
}

async function pending(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), pendingKey);
}

async function openSavedBasket(page, lineCount) {
  const delivery = page.getByRole('dialog', { name: 'Choose delivery for your order request' });
  if (await delivery.isVisible()) await delivery.getByRole('button', { name: 'Cancel', exact: true }).click();
  const notice = page.getByRole('dialog', { name: 'Basket updated', exact: true });
  if (await notice.isVisible()) await notice.getByRole('button', { name: 'Close', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Your basket needs review', exact: true });
  if (await review.isVisible()) await review.getByRole('button', { name: 'Close', exact: true }).click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  if (!await drawer.isVisible()) await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(drawer.getByRole('spinbutton')).toHaveCount(lineCount);
  if (lineCount) await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  return drawer;
}

async function setup(context, basket = items) {
  const safety = await installAccessibilityServices(context, { products, cartItems: basket });
  const saves = [];
  await context.route('**/api/account-cart', async route => {
    if (route.request().method() === 'DELETE') saves.push([]);
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      if (body.mode === 'save') saves.push(body.items);
    }
    return route.fallback();
  });
  return { safety, saves };
}

// The server proof fields are deliberately explicit: absence must fail closed.
function soldOut(product, lineIndex, overrides = {}) {
  return { sku: product.sku, name: product.name, currentPrice: product.price,
    currentStockQty: 0, toOrder: false, stockOrderable: false,
    stockChanged: true, quantityExceedsStock: true,
    removalProof: { eligible: true, source: 'main', lineIndex, productId: product.id,
      sku: product.sku, code: product.code, qty: 3, preference: '' }, ...overrides };
}
function rejection(changes) {
  return { error: 'These products are sold out.', code: 'ORDER_REVIEW_REQUIRED', rejectedBeforeCapture: true, changes };
}

for (const empty of [false, true]) {
  test(`${empty ? 'all-empty' : 'mixed survivor'}: exact Queen and Princess removal persists without automatic resend`, async ({ page, context }, testInfo) => {
    const { safety, saves } = await setup(context, empty ? items.slice(0, 2) : items);
    const posts = [];
    await context.route('**/api/send-order', route => {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(rejection([soldOut(queen, 0), soldOut(princess, 1)])) });
    });
    await signInCatalogue(page);
    await submitBasket(page);
    const notice = page.getByRole('dialog', { name: 'Basket updated', exact: true });
    await expect(notice).toBeVisible();
    await expect(notice.getByText('Removed from basket - out of stock', { exact: true })).toHaveCount(2);
    await expect(notice.getByText('Queen', { exact: true })).toBeVisible();
    await expect(notice.getByText('Princess', { exact: true })).toBeVisible();
    await page.screenshot({ path: `../mounted-proof/${testInfo.project.name}-${empty ? 'empty' : 'mixed'}-basket-updated.png`, fullPage: true });
    expect(posts).toHaveLength(1);
    expect(posts[0].items.slice(0, 2).map(item => [item.product.sku, item.product.checkoutSnapshot.unitPrice])).toEqual([['TK2154-GLD', 428], ['TK2120-GLD', 355]]);
    const originalPending = await pending(page);
    expect(originalPending.payload.clientRef).toBe(posts[0].clientRef);
    expect(originalPending.options).toBeTruthy();
    await expect.poll(() => saves.at(-1)?.length).toBe(empty ? 0 : 1);
    if (!empty) expect(saves.at(-1)[0].product.sku).toBe(survivor.sku);
    await openSavedBasket(page, empty ? 0 : 1);
    await page.screenshot({ path: `../mounted-proof/${testInfo.project.name}-${empty ? 'empty' : 'mixed'}-saved-basket.png`, fullPage: true });
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Your basket needs review', exact: true })).toBeVisible();
    await expect(page.getByText('Removed from basket - out of stock', { exact: true })).toHaveCount(0);
    expect(posts).toHaveLength(1);
    const reloaded = await pending(page);
    expect(reloaded.payload.clientRef).toBe(originalPending.payload.clientRef);
    expect(reloaded.options).toEqual(originalPending.options);
    await openSavedBasket(page, empty ? 0 : 1);
    expect(posts).toHaveLength(1);
    expect(safety.blockedRequests).toEqual([]);
    if (empty) {
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
      return;
    }
    await page.getByRole('button', { name: 'Close cart', exact: true }).filter({ visible: true }).click();
    await context.route('**/api/send-order', route => {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, orderId: 'inert-removal-capture', orderNumber: 'TEST-REMOVAL' }) });
    });
    await submitBasket(page);
    await expect(page.getByRole('heading', { name: 'Order request received. Thank you.' })).toBeVisible();
    expect(posts).toHaveLength(2);
    expect(posts[1].clientRef).toBe(posts[0].clientRef);
    for (const option of ['deliveryMethod', 'customerNotes', 'promoCode']) expect(posts[1][option]).toEqual(posts[0][option]);
    expect(posts[1].items.map(item => item.product.sku)).toEqual([survivor.sku]);
  });
}

for (const guard of [
  { name: 'ToOrder', product: { toOrder: true }, change: { toOrder: true } },
  { name: 'positive StockAvailable', change: { stockOrderable: true } },
  { name: 'landed preorder', product: { landed: true, toOrder: true }, change: { toOrder: true, stockOrderable: true } },
  { name: 'missing proof', change: { removalProof: undefined } },
  { name: 'false eligibility', proof: { eligible: false } },
  { name: 'unknown source', proof: { source: 'unknown' } },
  { name: 'instore source', product: { source: 'instore' }, proof: { source: 'instore' } },
  { name: 'API 503', status: 503 },
  { name: 'missing pre-capture marker', marker: false },
]) {
  test(`${guard.name} retains the line and pending request`, async ({ page, context }) => {
    const protectedProduct = { ...queen, ...guard.product };
    const { saves } = await setup(context, [{ product: protectedProduct, qty: 3 }]);
    const change = soldOut(protectedProduct, 0, guard.change);
    if (guard.proof) change.removalProof = { ...change.removalProof, ...guard.proof };
    const body = rejection([change]);
    if (guard.marker === false) delete body.rejectedBeforeCapture;
    const posts = [];
    await context.route('**/api/send-order', route => {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: guard.status || 409, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await signInCatalogue(page); await submitBasket(page);
    await expect(page.getByRole('dialog', { name: 'Your basket needs review' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Basket updated', exact: true })).toHaveCount(0);
    const intent = await pending(page);
    expect(intent.payload.items).toHaveLength(1);
    expect(intent.payload.clientRef).toBe(posts[0].clientRef);
    expect(saves.every(save => save.length === 1)).toBe(true);
    await page.reload();
    expect(posts).toHaveLength(1);
    const restored = await pending(page);
    expect(restored.payload).toEqual(intent.payload);
    expect(restored.options).toEqual(intent.options);
  });
}

for (const changedQuantity of [false, true]) {
  test(`held sold-out response after remote ${changedQuantity ? 'quantity and revision' : 'revision only'} change retains basket`, async ({ page, context }) => {
    const { saves } = await setup(context);
    let release;
    const held = new Promise(resolve => { release = resolve; });
    const posts = [];
    await context.route('**/api/send-order', async route => {
      posts.push(route.request().postDataJSON());
      await held;
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(rejection([soldOut(queen, 0), soldOut(princess, 1)])) });
    });
    await signInCatalogue(page); await submitBasket(page);
    await expect.poll(() => posts.length).toBe(1);
    const changed = items.map((item, index) => ({ ...item, qty: changedQuantity && index === 0 ? 4 : item.qty }));
    const remoteActivityAt = Date.now() - 2 * 86400000;
    await context.route('**/api/account-cart', route => route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: changed, activityAt: remoteActivityAt, revision: 50 }) })
      : route.fallback());
    const refreshed = page.waitForResponse(response => response.url().includes('/api/account-cart') && response.request().method() === 'GET');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await refreshed;
    await expect(page.locator('.order-drawer').getByText('28d left', { exact: true })).toBeAttached();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart') || '[]')[0]?.qty)).toBe(changedQuantity ? 4 : 3);
    release();
    await expect(page.getByRole('dialog', { name: 'Your basket needs review' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Basket updated', exact: true })).toHaveCount(0);
    expect(saves.every(save => save.length === 3)).toBe(true);
    expect((await pending(page)).payload.items).toHaveLength(3);
    expect(posts).toHaveLength(1);
  });
}

test('held response after account sign-out does not apply removal or resend', async ({ page, context }) => {
  const { saves } = await setup(context);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const posts = [];
  await context.route('**/api/send-order', async route => {
    posts.push(route.request().postDataJSON());
    await held;
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(rejection([soldOut(queen, 0), soldOut(princess, 1)])) });
  });
  await signInCatalogue(page); await submitBasket(page);
  await expect.poll(() => posts.length).toBe(1);
  const original = await pending(page);
  await context.route('**/mock-supabase/auth/v1/logout*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.evaluate(async () => {
    const { supabase } = await import('/src/lib/supabase.js');
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  });
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
  release();
  await expect(page.getByRole('dialog', { name: 'Basket updated', exact: true })).toHaveCount(0);
  expect((await pending(page)).payload).toEqual(original.payload);
  expect(saves.every(save => save.length === 3)).toBe(true);
  expect(posts).toHaveLength(1);
});


