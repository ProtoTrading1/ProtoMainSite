import { expect, test } from '@playwright/test';
import { checkoutRequestHash } from '../api/_order-replay.js';
import { basketLineKey } from '../lib/basket-lines.mjs';
import { ACCOUNT_ID, drawer, fixture, independentRequestHash, legacyKey, mount, pendingKey,
  prepare, product, readPending, receipt, send, syntheticSession } from './helpers/combined-checkout-services.js';

const failure = page => page.getByRole('dialog', { name: /^(Could not send order|Saved request needs confirmation)$/ });
const recoveredReceipt = page => page.getByRole('dialog', { name: 'Saved request received', exact: true });
async function installReadOnlyCheck(context, state, response) {
  state.checks = [];
  await context.route('**/api/checkout-recovery', route => {
    const body = route.request().postDataJSON(); state.checks.push(body);
    const captured = state.captures.get(body.clientRef);
    const result = response ?? (captured && captured.hash === independentRequestHash(body)
      ? { state: 'received', success: true, orderId: captured.orderId, orderNumber: captured.orderId, deliveryUnchecked: true }
      : { state: 'not_found', safeToStartNew: false, reconciliationRequired: true });
    return route.fulfill({ json: result });
  });
}

const originalItem = { product, qty: 20, preference: 'Blue' };
function originalIntent() {
  return { version: 1, customerId: ACCOUNT_ID,
    payload: { clientRef: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deliveryMethod: 'In store pick up', customerNotes: 'Frozen synthetic notes', promoCode: null,
      items: [{ qty: 20, preference: 'Blue', product: { id: product.id, sku: product.sku, code: product.code, name: product.name,
        isExtendedRange: false, checkoutSnapshot: { unitPrice: 79.5, stockQty: 100 } } }] },
    items: [structuredClone(originalItem)], total: 1590, fingerprint: JSON.stringify([[basketLineKey(originalItem), 20]]),
    options: { courierChoice: 'pickup', customerNotes: 'Frozen synthetic notes', promo: null } };
}

test('independent V3 stub hashes snapshots, source and normalized preferences like the server pure contract', () => {
  const body = originalIntent().payload;
  expect(independentRequestHash(body)).toBe(checkoutRequestHash(body));
  for (const change of [p => { p.items[0].product.checkoutSnapshot.unitPrice = 80; },
    p => { p.items[0].product.checkoutSnapshot.stockQty = 99; }, p => { p.items[0].product.isExtendedRange = true; }]) {
    const different = structuredClone(body); change(different);
    expect(independentRequestHash(different)).toBe(checkoutRequestHash(different));
    expect(independentRequestHash(different)).not.toBe(independentRequestHash(body));
  }
});

test('silent durable checkout write blocks dispatch and retains the basket', async ({ page, context }) => {
  const state = await fixture(context); await mount(page); await prepare(page);
  await page.evaluate(() => { window.__combinedStorageMode = 'checkout-silent'; }); await send(page);
  await expect(failure(page)).toContainText(/safely|storage|reference/i);
  expect(state.posts).toEqual([]); expect(state.cart.items[0].qty).toBe(20);
  expect(await readPending(page)).toBeNull(); expect(state.safety.blockedRequests).toEqual([]);
});

test('saved Instore metadata survives a main SKU collision and checkout forwards the strict source flag', async ({ page, context }) => {
  const instore = { ...product, source: 'instore', isExtendedRange: true, minQty: 6, unitsOfIssue: 'Box of 6', sellingUnit: 'Box of 6' };
  const state = await fixture(context, { cartItems: [{ product: instore, qty: 20 }] });
  await mount(page); await prepare(page);
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart')));
  expect(local[0].product).toMatchObject({ source: 'instore', isExtendedRange: true, minQty: 6, unitsOfIssue: 'Box of 6', sellingUnit: 'Box of 6' });
  await send(page); await expect(receipt(page)).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.posts[0].items[0].product.isExtendedRange).toBe(true);
  expect(state.captures.size).toBe(1); expect(state.safety.blockedRequests).toEqual([]);
});

test('accepted POST plus silent pending journals and clear503 preserves reference and ORIGINAL snapshots after reload', async ({ page, context }, testInfo) => {
  const state = await fixture(context); state.failDelete = true;
  state.respond = async (route, body) => {
    if (state.posts.length === 1) await page.evaluate(() => { window.__combinedStorageMode = 'compound-silent'; });
    return state.accept(route, body);
  };
  await mount(page); await prepare(page); await send(page); await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toContainText(/Do not resubmit|basket|cleanup/i);
  await expect.poll(() => state.deletes).toBeGreaterThan(0);
  const retained = await readPending(page); expect(retained.payload).toEqual(state.posts[0]);
  const screenshot = testInfo.outputPath('synthetic-accepted-clear-interrupted.png');
  await page.screenshot({ path: screenshot }); await testInfo.attach('synthetic accepted checkout with interrupted basket clear', { path: screenshot, contentType: 'image/png' });
  expect(await page.evaluate(account => localStorage.getItem(`proto_cart_pending_${account}`), ACCOUNT_ID)).toBeNull();
  expect(state.captures.size).toBe(1);
  // Today's metadata now differs. A freshly generated snapshot conflicts with
  // the captured request even if its reference is reused.
  state.cart.items[0].product.price = 80; state.cart.items[0].product.stockQty = 99; state.cart.items[0].product.stockOnHand = 99;
  state.respond = null; await installReadOnlyCheck(context, state); await mount(page);
  await expect(failure(page)).toBeVisible(); expect(state.posts).toHaveLength(1);
  const deletesBeforeCheck = state.deletes;
  await failure(page).getByRole('button', { name: 'Check saved request', exact: true }).click();
  await expect(recoveredReceipt(page)).toBeVisible();
  expect(state.deletes).toBe(deletesBeforeCheck);
  expect(state.posts).toHaveLength(1); expect(state.checks).toEqual([state.posts[0]]); expect(state.captures.size).toBe(1);
  expect((await readPending(page)).payload).toEqual(state.posts[0]);
  expect(state.cart.items[0].qty).toBe(20); expect(state.safety.blockedRequests).toEqual([]);
});

for (const provenance of ['explicit-source', 'PR262-without-source']) test(`valid current-format ${provenance} pending intent checks exact original payload without dispatch and keeps a changed basket`, async ({ page, context }) => {
  const newer = { product: { ...product, price: 90 }, qty: 21, preference: 'Pink' };
  const state = await fixture(context, { cartItems: [newer] }); await mount(page);
  const intent = originalIntent();
  if (provenance === 'PR262-without-source') {
    delete intent.items[0].product.source; delete intent.items[0].product.isExtendedRange;
    delete intent.payload.items[0].product.isExtendedRange;
  }
  state.captures.set(intent.payload.clientRef, { hash: independentRequestHash(intent.payload), orderId: 'SYNTHETIC-PRIOR-CAPTURE' });
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: pendingKey, value: intent });
  await installReadOnlyCheck(context, state);
  await mount(page); await expect(failure(page)).toBeVisible(); expect(state.posts).toEqual([]);
  await failure(page).getByRole('button', { name: 'Check saved request', exact: true }).click(); await expect(recoveredReceipt(page)).toBeVisible();
  expect(state.posts).toEqual([]); expect(state.checks).toEqual([intent.payload]); expect(state.captures.size).toBe(1);
  expect((await readPending(page)).payload).toEqual(intent.payload);
  expect(state.cart.items[0].qty).toBe(21); expect(state.deletes).toBe(0);
});

for (const namespace of ['current-malformed', 'legacy-valid', 'legacy-malformed', 'both-conflicting']) {
  test(`${namespace} recovery evidence blocks a fresh reference and preserves bytes`, async ({ page, context }) => {
    const state = await fixture(context); await mount(page);
    const old = { version: 1, accountId: ACCOUNT_ID, clientRef: originalIntent().payload.clientRef, status: 'pending', dispatchCount: 1,
      fingerprint: JSON.stringify([[product.id, 20, 'Blue']]), payload: originalIntent().payload };
    const records = namespace === 'current-malformed' ? [[pendingKey, '{broken']] :
      namespace === 'legacy-valid' ? [[legacyKey, JSON.stringify(old)]] :
      namespace === 'legacy-malformed' ? [[legacyKey, '{broken']] : [[legacyKey, JSON.stringify(old)], [pendingKey, JSON.stringify(originalIntent())]];
    await page.evaluate(entries => entries.forEach(([key, value]) => localStorage.setItem(key, value)), records);
    await mount(page); await expect(failure(page)).toContainText(/My Orders|contact|previous|safely/i);
    expect(state.posts).toEqual([]);
    for (const [key, raw] of records) expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
    await expect(failure(page).getByRole('button', { name: 'Check My Orders', exact: true })).toBeVisible();
    await failure(page).getByRole('button', { name: 'Close', exact: true }).last().click();
    await prepare(page); await send(page); await expect(failure(page)).toBeVisible();
    expect(state.posts).toEqual([]);
    for (const [key, raw] of records) expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(raw);
    expect(state.safety.blockedRequests).toEqual([]);
  });
}

test('native two-tab Web Lock queues fresh checkout and read-only missing receipt holds the frozen V3 payload', async ({ page, context }) => {
  const state = await fixture(context); const second = await context.newPage();
  let release; const held = new Promise(resolve => { release = resolve; });
  state.respond = async (route, body) => {
    if (state.posts.length === 1) { await held; return route.fulfill({ status: 503, json: { error: 'Synthetic uncertain failure' } }); }
    return state.accept(route, body);
  };
  await mount(page); await mount(second); await prepare(page); await prepare(second);
  await send(page); await expect.poll(() => state.posts.length).toBe(1); await send(second);
  try {
    await expect.poll(() => second.evaluate(async account => (await navigator.locks.query()).pending.filter(lock => lock.name === `proto-checkout:${account}`).length, ACCOUNT_ID)).toBe(1);
    expect(state.posts).toHaveLength(1);
  } finally { release(); }
  await expect(failure(second)).toContainText(/earlier|Try again|same request/i);
  expect(state.posts).toHaveLength(1);
  await installReadOnlyCheck(context, state);
  const before = await readPending(second); const deletes = state.deletes;
  await failure(second).getByRole('button', { name: 'Check saved request', exact: true }).click();
  await expect(failure(second)).toContainText(/No matching received order was found/);
  expect(state.posts).toHaveLength(1); expect(state.checks).toEqual([state.posts[0]]); expect(state.captures.size).toBe(0);
  expect(await readPending(second)).toEqual(before); expect(state.deletes).toBe(deletes); expect(state.cart.items[0].qty).toBe(20);
  expect(state.safety.blockedRequests).toEqual([]);
});

const reviewResponse = route => route.fulfill({ status: 409, json: { code: 'ORDER_REVIEW_REQUIRED', error: 'Synthetic explicit review',
  changes: [{ sku: product.sku, currentPrice: product.price, currentStockQty: 100 }] } });

async function amendReviewedBasket(page, state) {
  await page.getByRole('dialog', { name: 'Your basket needs review', exact: true }).getByRole('button', { name: 'Review current basket', exact: true }).click();
  const input = drawer(page).getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true });
  await input.fill('21'); await input.blur();
  await expect.poll(() => state.cart.items[0]?.qty).toBe(21);
  await expect(drawer(page).getByText('Saved to account', { exact: true })).toBeVisible();
}

test('first explicit review rejection authorizes an amended basket with the original reference', async ({ page, context }) => {
  const state = await fixture(context); state.respond = reviewResponse;
  await mount(page); await prepare(page); await send(page);
  await expect(page.getByRole('dialog', { name: 'Your basket needs review', exact: true })).toBeVisible();
  expect((await readPending(page)).confirmedRejectedBeforeCapture).toBe(true);
  await amendReviewedBasket(page, state); state.respond = null; await prepare(page); await send(page);
  await expect(receipt(page)).toBeVisible(); expect(state.posts).toHaveLength(2);
  expect(state.posts[1].clientRef).toBe(state.posts[0].clientRef); expect(state.posts[1].items[0].qty).toBe(21); expect(state.captures.size).toBe(1);
});

test('lost dispatch then missing receipt cannot authorize a changed basket or fresh reference', async ({ page, context }) => {
  const state = await fixture(context);
  state.respond = route => state.posts.length === 1 ? route.abort('connectionreset') : reviewResponse(route);
  await mount(page); await prepare(page); await send(page); await expect(failure(page)).toBeVisible();
  await installReadOnlyCheck(context, state);
  await failure(page).getByRole('button', { name: 'Check saved request', exact: true }).click();
  await expect(failure(page)).toContainText(/No matching received order was found/);
  const uncertain = await readPending(page); expect(uncertain.dispatchCount).toBe(1); expect(uncertain.confirmedRejectedBeforeCapture).toBe(false);
  await failure(page).getByRole('button', { name: 'Close', exact: true }).last().click();
  const input = drawer(page).getByRole('spinbutton', { name: `Quantity for ${product.code}`, exact: true });
  await input.fill('21'); await input.blur(); await expect.poll(() => state.cart.items[0]?.qty).toBe(21);
  await expect(drawer(page).getByText('Saved to account', { exact: true })).toBeVisible(); await prepare(page); await send(page);
  await expect(failure(page)).toContainText(/previous|confirmation|earlier|safely/i);
  expect(state.posts).toHaveLength(1); expect(state.checks).toEqual([state.posts[0]]); expect((await readPending(page)).payload.clientRef).toBe(uncertain.payload.clientRef);
});

test('native queued checkout cancels on account A-B-A without staging or dispatch', async ({ page, context }) => {
  const state = await fixture(context); await mount(page); await prepare(page);
  const holder = await context.newPage(); await holder.goto('/');
  await holder.evaluate(account => {
    window.__combinedLock = navigator.locks.request(`proto-checkout:${account}`, () => new Promise(resolve => { window.__combinedRelease = resolve; }));
  }, ACCOUNT_ID);
  await expect.poll(() => holder.evaluate(() => typeof window.__combinedRelease)).toBe('function'); await send(page);
  try {
    await expect.poll(() => page.evaluate(async account => (await navigator.locks.query()).pending.filter(lock => lock.name === `proto-checkout:${account}`).length, ACCOUNT_ID)).toBe(1);
    await page.evaluate(async session => {
      const { rememberAuthSession } = await import('/src/lib/authHeaders.js');
      rememberAuthSession({ ...session, access_token: 'synthetic-other-account-token', user: { ...session.user, id: '00000000-0000-4000-8000-000000000211' } });
      rememberAuthSession(session);
    }, syntheticSession());
  } finally { await holder.evaluate(() => window.__combinedRelease()); }
  await expect.poll(() => page.evaluate(async account => { const locks = await navigator.locks.query(); return [...locks.held, ...locks.pending].filter(lock => lock.name === `proto-checkout:${account}`).length; }, ACCOUNT_ID)).toBe(0);
  await expect(failure(page)).toHaveCount(0); expect(state.posts).toEqual([]); expect(await readPending(page)).toBeNull();
  expect(state.cart.items[0].qty).toBe(20); expect(state.safety.blockedRequests).toEqual([]);
});

test('stale second tab cannot dispatch a fresh reference after acknowledged clear', async ({ page, context }) => {
  const state = await fixture(context), second = await context.newPage();
  await mount(page); await mount(second); await prepare(page); await prepare(second);
  await send(page); await expect(receipt(page)).toBeVisible(); await expect.poll(() => state.cart.items.length).toBe(0);
  await expect.poll(() => readPending(page)).toBeNull(); await send(second);
  await expect(failure(second)).toContainText(/basket changed|reload|sync/i);
  expect(state.posts).toHaveLength(1); expect(state.captures.size).toBe(1);
});
