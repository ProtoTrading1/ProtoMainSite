import { fork } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';
import { expect, test } from '@playwright/test';
import {
  ACCOUNT_ID, installAccessibilityServices, LOCAL_ORIGIN, signInCatalogue, syntheticSession,
} from './helpers/accessibility-services.js';

test.use({ serviceWorkers: 'block' });

const barcode = '1234567890123';
const variants = [
  { sku: 'SYNTHETIC-BLUE', name: 'Synthetic notebook blue', preference: 'Blue', price: 400, qty: 2 },
  { sku: 'SYNTHETIC-RED', name: 'Synthetic notebook red', preference: 'Red', price: 300, qty: 1 },
];
const basket = variants.map(({ sku, name, preference, price, qty }) => ({
  product: {
    id: sku, sku, code: barcode, barcode, name, title: name, price, unitsOfIssue: 'Each',
    stockOnHand: 1, availableStock: 1, stockQty: 1, inStock: true, minQty: 1,
    categoryLabel: 'Synthetic checkout', categoryPath: [], image: '/bag_black.png',
  },
  qty, preference,
}));

function startSqlFixture(accessToken) {
  const child = fork(new URL('./helpers/basket-postgres-fixture.mjs', import.meta.url), [], {
    // Never pass Vercel, Supabase, POS, notifier, proxy or CI tokens through.
    env: { FIXTURE_AUTH_TOKEN: accessToken }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  const inflight = new Map();
  let nextId = 0;
  const ready = new Promise((resolve, reject) => inflight.set('ready', { resolve, reject }));
  child.on('message', ({ ready: started, id, value, error }) => {
    const key = started ? 'ready' : id;
    const future = inflight.get(key);
    if (!future) return;
    inflight.delete(key);
    if (error) future.reject(new Error(error));
    else future.resolve(value);
  });
  const fail = (error) => {
    for (const future of inflight.values()) future.reject(error);
    inflight.clear();
  };
  child.on('error', fail);
  child.on('exit', (code, signal) => fail(new Error(`Isolated SQL fixture exited: ${code ?? signal}`)));
  const call = (operation, payload) => new Promise((resolve, reject) => {
    const id = ++nextId;
    inflight.set(id, { resolve, reject });
    child.send({ id, operation, payload }, error => {
      if (error) { inflight.delete(id); reject(error); }
    });
  });
  return {
    ready,
    call,
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const exited = once(child, 'exit');
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      try {
        if (child.connected) await call('close');
        await exited;
      } finally {
        clearTimeout(timer);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }
    },
  };
}

async function submitBasket(page) {
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(page.locator('.order-drawer').filter({ visible: true }).locator('[data-cart-line-key]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Review order request', exact: true }).filter({ visible: true }).click();
  await expect(page.getByText(/Orders are requests. Stock is shared/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue to options', exact: true }).click();
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  await page.getByRole('button', { name: /Pick up in store/ }).click();
  await page.getByRole('button', { name: 'Send order request — no payment now', exact: true }).click();
}

test('checkout after a lost response reuses one real SQL order with both exact variants and no notifications', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Single isolated checkout case');
  test.setTimeout(60_000);
  const session = syntheticSession();
  const authorization = 'Bearer ' + session.access_token;
  const sql = startSqlFixture(session.access_token);
  try {
    await sql.ready;
    const seeded = await sql.call('invoke', {
      path: '/api/account-cart', method: 'PUT', authorization,
      body: { mode: 'save', revision: 0, activityAt: Date.now(), items: basket },
    });
    expect(seeded.status).toBe(200);
    expect(seeded.body.items.map(line => line.product.sku)).toEqual(variants.map(line => line.sku));

    // The repo's route fixture blocks non-loopback and unknown app APIs.
    // The additional handler routes below validate exact loopback origin.
    expect(LOCAL_ORIGIN).toBe(`http://127.0.0.1:${Number(process.env.PROTO_PLAYWRIGHT_PORT || 4173)}`);
    await context.routeWebSocket('**/*', socket => socket.close());
    const safety = await installAccessibilityServices(context, { products: basket.map(line => line.product) });
    await context.route(url => url.pathname === '/mock-supabase/auth/v1/token', route => {
      if (new URL(route.request().url()).origin !== LOCAL_ORIGIN || route.request().method() !== 'POST') return route.abort();
      return route.fulfill({ json: session });
    });
    await context.route('**/api/stock?**', route => {
      if (new URL(route.request().url()).origin !== LOCAL_ORIGIN || route.request().method() !== 'GET') return route.abort();
      return route.fulfill({ json: { qty: 1, to_order: false } });
    });
    const posts = [];
    const wireHandler = async (route) => {
      const request = route.request(), url = new URL(request.url());
      const header = request.headers().authorization;
      if (url.origin !== LOCAL_ORIGIN || header !== authorization) return route.abort();
      const method = request.method();
      const body = method === 'GET' ? undefined : request.postDataJSON();
      const result = await sql.call('invoke', { path: url.pathname, method, authorization: header, body });
      if (url.pathname === '/api/send-order') {
        posts.push({ body, result });
        // Exercise uncertainty after the real handler stores the first order.
        // Only its browser receipt is lost; never forge a successful response.
        if (posts.length === 1) return route.fulfill({ status: 503, json: { error: 'Synthetic lost checkout receipt' } });
      }
      return route.fulfill({ status: result.status, json: result.body });
    };
    await context.route('**/api/account-cart', wireHandler);
    await context.route('**/api/send-order', wireHandler);

    await signInCatalogue(page);
    await submitBasket(page);
    await expect(page.getByText('Synthetic lost checkout receipt', { exact: true })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(posts[0].result.status).toBe(200);
    expect(posts[0].result.body).toMatchObject({ success: true, emailDeliveryFailed: true });
    const original = await sql.call('receipt');
    expect(original.orders).toHaveLength(1);
    expect(original.orders[0].checkout_request_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(original.orders[0].id).toBe(posts[0].result.body.orderId);

    const pendingKey = `proto_pending_checkout_v1:${ACCOUNT_ID}`;
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).payload.clientRef, pendingKey)).toBe(original.orders[0].client_ref);
    await page.reload();
    await expect(page.locator('.product-card').first()).toBeVisible();
    expect(posts).toHaveLength(1);
    await submitBasket(page);
    await expect(page.getByRole('heading', { name: 'Order request received. Thank you.' })).toBeVisible();
    await expect(page.getByRole('dialog').getByText(new RegExp(original.orders[0].order_number))).toBeVisible();
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toEqual(posts[0].body);
    expect(posts[1].result.status).toBe(200);
    expect(posts[1].result.body.orderId).toBe(posts[0].result.body.orderId);
    expect(await page.evaluate(key => localStorage.getItem(key), pendingKey)).toBeNull();

    const receipt = await sql.call('receipt');
    expect(receipt.orders).toEqual(original.orders);
    expect(receipt.orders[0].items.map(line => [line.productId, line.preference, line.qty, line.unitPrice]))
      .toEqual(variants.map(line => [line.sku, line.preference, line.qty, line.price]));
    for (const line of receipt.orders[0].items) {
      expect(line.stockRequest).toEqual({ sharedStock: true, availableQty: 1, requestedQty: 3, shortfallQty: 2 });
    }
    expect(receipt.jobs).toEqual(['customer_email', 'pdf', 'team_email'].map(channel => ({
      channel, source: 'storefront-replay-v3', status: 'pending', attempt_count: 0,
    })));
    expect(receipt.deniedDeliveryClaims).toBe(6);
    expect(receipt.notifierInvocations).toBe(0);
    expect(receipt.blockedOutbound).toEqual([]);
    expect(safety.blockedRequests.filter(path => /send-order|order-notify|product-request/i.test(path))).toEqual([]);
  } finally {
    await sql.close();
  }
});
