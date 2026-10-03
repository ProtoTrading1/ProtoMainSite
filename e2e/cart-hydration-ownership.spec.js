import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const product = catalogueProducts[0];
const pendingKey = `proto_cart_pending_${ACCOUNT_ID}`;

async function setup(context, cartItems = []) {
  const safety = await installAccessibilityServices(context, { cartItems });
  // Keep an unrelated development edit from replaying the held operation.
  await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
  await context.addInitScript(() => {
    window.__ownershipReplies = {};
    const json = Response.prototype.json;
    Response.prototype.json = async function (...args) {
      const value = await json.apply(this, args);
      const tag = Array.isArray(value) ? value[0]?.__ownershipTag : value?.__ownershipTag;
      if (tag) window.__ownershipReplies[tag] = (window.__ownershipReplies[tag] || 0) + 1;
      return value;
    };
  });
  await context.route('**/synthetic-journal-writer', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Synthetic journal writer</title>',
  }));
  const writer = await context.newPage();
  await writer.goto('/synthetic-journal-writer');
  return { writer, safety };
}

async function writeNewerBasket(writer, qty = 2) {
  return writer.evaluate(async ({ accountId, product, qty }) => {
    const { writePendingCart } = await import('/src/lib/cartSyncJournal.mjs');
    const items = [{ product, qty }];
    const kept = writePendingCart(localStorage, accountId,
      { items, activityAt: Date.now(), type: 'save', intent: 'normal' }, 1);
    const canonical = JSON.stringify(items);
    localStorage.setItem('proto_cart', canonical);
    localStorage.setItem('proto_cart_owner', accountId);
    return { kept, journal: localStorage.getItem(`proto_cart_pending_${accountId}`), canonical };
  }, { accountId: ACCOUNT_ID, product, qty });
}

function heldReplies() {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const replies = [];
  return {
    started,
    async hold(route, body) {
      const done = gate.then(() => route.fulfill({ json: body }));
      replies.push(done);
      entered();
      await done;
    },
    async release(page, tag) {
      // StrictMode can cancel the first hydration; hold every startup reply.
      await page.bringToFront();
      const count = replies.length;
      release();
      await Promise.all(replies);
      await expect.poll(() => page.evaluate(tag => window.__ownershipReplies[tag] || 0, tag)).toBe(count);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    },
  };
}

async function openBasket(page) {
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  return page.locator('.order-drawer').filter({ visible: true }).first();
}

async function expectNewerCopy(page, expected) {
  expect(expected.kept).toBe(true);
  expect(await page.evaluate(key => ({ journal: localStorage.getItem(key), canonical: localStorage.getItem('proto_cart') }), pendingKey))
    .toEqual({ journal: expected.journal, canonical: expected.canonical });
  const drawer = await openBasket(page);
  await expect(drawer.getByRole('alert')).toContainText('Support code: cart_conflict');
  await expect(drawer.getByText('Saved to account', { exact: true })).toHaveCount(0);
  return drawer;
}

test('older startup hydration preserves newer same-account tab journal and canonical basket', async ({ page, context }) => {
  const { writer, safety } = await setup(context);
  const held = heldReplies();
  await context.route('**/api/account-cart', async route => {
    const body = route.request().method() === 'PUT' ? route.request().postDataJSON() : null;
    if (body?.mode === 'merge') return held.hold(route, { items: [], revision: 1, activityAt: null, __ownershipTag: 'merge' });
    return route.fallback();
  });
  await signInCatalogue(page);
  await held.started;
  const expected = await writeNewerBasket(writer);
  await held.release(page, 'merge');
  await expectNewerCopy(page, expected);
  expect(safety.blockedRequests).toEqual([]);
});

test('pending draft changed during product hydration keeps the newer tab copy', async ({ page, context }) => {
  const { writer, safety } = await setup(context);
  await writeNewerBasket(writer, 1);
  const held = heldReplies();
  await context.route('**/api/products?**', async route => {
    if (new URL(route.request().url()).searchParams.has('skus')) {
      return held.hold(route, catalogueProducts.map(item => ({ ...item, __ownershipTag: 'products' })));
    }
    return route.fallback();
  });
  await signInCatalogue(page);
  await held.started;
  const expected = await writeNewerBasket(writer);
  await held.release(page, 'products');
  const drawer = await expectNewerCopy(page, expected);
  await expect(drawer.getByText('Your basket is empty', { exact: true })).toHaveCount(0);
  expect(safety.blockedRequests).toEqual([]);
});

for (const method of ['PUT', 'DELETE']) {
  test(`older ${method} acknowledgement preserves a newer same-account tab journal`, async ({ page, context }) => {
    const { writer, safety } = await setup(context, [{ product, qty: 4 }]);
    const held = heldReplies();
    await context.route('**/api/account-cart', async route => {
      const request = route.request();
      const body = request.method() === 'PUT' ? request.postDataJSON() : null;
      if (request.method() === method && (method === 'DELETE' || body?.mode === 'save')) {
        return held.hold(route, { items: method === 'DELETE' ? [] : body.items,
          revision: 2, activityAt: Date.now(), __ownershipTag: 'ack' });
      }
      return route.fallback();
    });
    await signInCatalogue(page);
    const drawer = await openBasket(page);
    await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
    if (method === 'DELETE') {
      await drawer.getByRole('button', { name: 'Clear order', exact: true }).dispatchEvent('click');
    } else {
      const quantity = drawer.getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true });
      await quantity.fill('7');
      await quantity.blur();
    }
    await held.started;
    const expected = await writeNewerBasket(writer);
    await held.release(page, 'ack');
    expect(expected.kept).toBe(true);
    expect(await page.evaluate(key => ({ journal: localStorage.getItem(key), canonical: localStorage.getItem('proto_cart') }), pendingKey))
      .toEqual({ journal: expected.journal, canonical: expected.canonical });
    await expect(drawer.getByRole('alert')).toContainText('Support code: cart_conflict');
    await expect(drawer.getByText('Saved to account', { exact: true })).toHaveCount(0);
    expect(safety.blockedRequests).toEqual([]);
  });
}

test('queued DELETE stops before dispatch when another tab replaces the owned journal', async ({ page, context }) => {
  const { writer, safety } = await setup(context, [{ product, qty: 4 }]);
  const deletes = [];
  await context.route('**/api/account-cart', async route => {
    if (route.request().method() === 'DELETE') deletes.push(route.request().postDataJSON());
    return route.fallback();
  });
  await signInCatalogue(page);
  const drawer = await openBasket(page);
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  // Install the clock after auth and hydration: only the queued mutation's
  // debounce is under test, rather than SDK startup scheduling.
  await page.clock.install({ time: new Date() });
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await drawer.getByRole('button', { name: 'Clear order', exact: true }).dispatchEvent('click');
  await expect(drawer.getByText('Your basket is empty', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null')?.type, pendingKey)).toBe('clear');
  expect(deletes).toEqual([]);
  const expected = await writeNewerBasket(writer);
  await page.bringToFront();
  await page.clock.runFor(1000);
  await page.clock.runFor(32);
  expect(deletes).toEqual([]);
  expect(expected.kept).toBe(true);
  expect(await page.evaluate(key => ({ journal: localStorage.getItem(key), canonical: localStorage.getItem('proto_cart') }), pendingKey))
    .toEqual({ journal: expected.journal, canonical: expected.canonical });
  await expect(drawer.getByRole('alert')).toContainText('Support code: cart_conflict');
  await expect(drawer.getByText('Saved to account', { exact: true })).toHaveCount(0);
  expect(safety.blockedRequests).toEqual([]);
});
