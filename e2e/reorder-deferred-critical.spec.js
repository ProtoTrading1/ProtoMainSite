import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

// The real React root executes the actual App handler extracted from Vite's
// raw source, with actual basket helpers and an inert deferred lookup.
async function mountActualHandler(page, context) {
  await installAccessibilityServices(context);
  await page.goto('/');
  await page.evaluate(async () => {
    const [runtime, { default: source }, basket, recovery, preference, { default: ReorderModal }] = await Promise.all([
      import('/e2e/fixtures/reorder-runtime.js'), import('/src/App.jsx?raw'),
      import('/lib/basket-lines.mjs'), import('/src/lib/cartProductRecovery.mjs'), import('/lib/item-preference.mjs'), import('/src/components/ReorderModal.jsx'),
    ]);
    const { React, flushSync, createRoot } = runtime;
    const body = source.match(/const handleReorder = ([\s\S]*?\r?\n {2}});/)[1];
    const product = id => ({ id, sku: id, code: id, name: id, price: 100, stockQty: 100, source: 'main', isExtendedRange: false });
    const identity = { userId: 'synthetic-owner' };
    let release;
    const lookup = new Promise(resolve => { release = resolve; });
    const lastOrder = { id: 'synthetic', created_at: new Date().toISOString(), items: [{ productId: 'REORDER',
      code: 'REORDER', source: 'main', isExtendedRange: false, name: 'Synthetic reorder', qty: 1, unitPrice: 100 }] };
    function Harness() {
      const [items, setCartItems] = React.useState([{ product: product('KEPT'), qty: 2 }]);
      const [showModal, setShowModal] = React.useState(false);
      const currentCartRef = React.useRef({ items, activityAt: 1 });
      React.useLayoutEffect(() => { currentCartRef.current = { items, activityAt: 1 }; }, [items]);
      const context = { ...basket, ...recovery, ...preference, customer: { id: identity.userId },
        captureAuthIdentity: () => identity, cartAccountRef: { current: identity.userId },
        cartHydratedRef: { current: true }, cartRevisionRef: { current: 7 }, pendingJournalRef: { current: { raw: null } },
        pendingCheckoutRef: { current: null }, lastCheckoutOptionsRef: { current: null },
        cartConflictRef: { current: false }, cartSyncInFlightRef: { current: false },
        currentCartRef, canChangeBasket: () => true, fetchProductsBySkus: () => lookup, catalogProducts: [],
        cartQtyCapForProduct: item => item.stockQty, MAX_CART_LINES: 250,
        setCartItems, flushSync,
        markCartActivity: () => { window.__critical.activity++; },
        setReorderModal: () => { window.__critical.closes++; } };
      const handler = new Function(...Object.keys(context), `return (${body});`)(...Object.values(context));
      window.__critical = { ...(window.__critical || { activity: 0, closes: 0 }), items,
        verifySynchronousCommit: () => {
          const next = items.map(item => ({ ...item }));
          flushSync(() => setCartItems(next));
          return currentCartRef.current.items === next;
        },
        start: () => { window.__critical.pending = handler([{ productId: 'REORDER', source: 'main', isExtendedRange: false, qty: 1 }]); },
        mountModal: () => setShowModal(true),
        unmountModal: () => flushSync(() => setShowModal(false)),
        queueAndRelease: newer => { setCartItems(newer); release(new Map([['REORDER', product('REORDER')]])); },
        release: () => release(new Map([['REORDER', product('REORDER')]])) };
      return React.createElement(React.Fragment, null,
        React.createElement('output', { id: 'critical-basket' }, JSON.stringify(items.map(item => [item.product.id, item.qty]))),
        showModal ? React.createElement(ReorderModal, { lastOrder, onClose: () => setShowModal(false),
          onReorder: (requested, options) => { window.__critical.pending = handler(requested, options); return window.__critical.pending; } }) : null);
    }
    const container = document.createElement('div'); document.body.appendChild(container);
    createRoot(container).render(React.createElement(React.StrictMode, null, React.createElement(Harness)));
  });
  await expect(page.locator('#critical-basket')).toHaveText('[["KEPT",2]]');
  expect(await page.evaluate(() => window.__critical.verifySynchronousCommit()), 'renderer and committed-ref publisher must share synchronous ownership').toBe(true);
}

test('actual React queued basket edit wins deferred reorder without false added count', async ({ page, context }) => {
  await mountActualHandler(page, context);
  const result = await page.evaluate(async () => {
    window.__critical.start();
    window.__critical.queueAndRelease([{ product: { id: 'KEPT', sku: 'KEPT', code: 'KEPT', source: 'main', isExtendedRange: false, price: 100, stockQty: 100 }, qty: 9 },
      { product: { id: 'NEW', sku: 'NEW', code: 'NEW', source: 'main', isExtendedRange: false, price: 100, stockQty: 100 }, qty: 4 }]);
    return window.__critical.pending;
  });
  expect(result.added).toBe(0);
  await expect(page.locator('#critical-basket')).toHaveText('[["KEPT",9],["NEW",4]]');
  expect(await page.evaluate(() => window.__critical.activity)).toBe(0);
});

test('actual React committed reorder reports accurate count under StrictMode', async ({ page, context }) => {
  await mountActualHandler(page, context);
  const result = await page.evaluate(async () => { window.__critical.start(); window.__critical.release(); return window.__critical.pending; });
  expect(result.added).toBe(1);
  await expect(page.locator('#critical-basket')).toHaveText('[["KEPT",2],["REORDER",1]]');
  expect(await page.evaluate(() => window.__critical.activity)).toBe(1);
});

test('actual component unmount aborts its deferred reorder without resurrecting items', async ({ page, context }) => {
  await mountActualHandler(page, context);
  await page.evaluate(() => window.__critical.mountModal());
  const modal = page.getByRole('dialog', { name: 'Reorder', exact: true });
  await modal.getByRole('button', { name: 'Add 1 item to order', exact: true }).click();
  const result = await page.evaluate(async () => {
    window.__critical.unmountModal(); window.__critical.release(); return window.__critical.pending;
  });
  expect(result.added).toBe(0);
  await expect(modal).toHaveCount(0);
  await expect(page.locator('#critical-basket')).toHaveText('[["KEPT",2]]');
});

for (const cancellation of ['Close', 'Escape', 'backdrop']) {
  test(`actual reorder ${cancellation} cancels lookup before it can add products`, async ({ page, context }) => {
    const products = catalogueProducts.map(product => ({ ...product, price: 250 }));
    const current = [{ product: products[1], qty: 4 }];
    const lastOrder = { id: 'SYNTHETIC-REORDER', customer_id: ACCOUNT_ID, order_number: 'SYNTHETIC',
      created_at: new Date().toISOString(), total: 250, items: [{ productId: products[0].id, code: products[0].code,
        source: 'main', isExtendedRange: false, name: products[0].name, qty: 1, unitPrice: 250 }] };
    const safety = await installAccessibilityServices(context, { products, cartItems: current, lastOrder });
    await context.routeWebSocket('**/*', socket => socket.send(JSON.stringify({ type: 'connected' })));
    await signInCatalogue(page);
    await page.getByRole('button', { name: /^My profile$/i }).filter({ visible: true }).first().click();
    await page.getByRole('button', { name: 'View order', exact: true }).click();
    await page.getByRole('button', { name: 'Review & reorder available items', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Reorder', exact: true });
    await expect(modal).toBeVisible();
    let release; let calls = 0;
    const waiting = new Promise(resolve => { release = resolve; });
    await context.route('**/api/products?skus=*', async route => { calls++; await waiting; await route.fulfill({ json: products }); });
    await modal.getByRole('button', { name: 'Add 1 item to order', exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    if (cancellation === 'Close') await modal.getByRole('button', { name: 'Close reorder', exact: true }).click();
    if (cancellation === 'Escape') await page.keyboard.press('Escape');
    if (cancellation === 'backdrop') await page.mouse.click(2, 2);
    await expect(modal).toHaveCount(0);
    const response = page.waitForResponse(reply => reply.url().includes('/api/products?skus='));
    release();
    await (await response).finished();
    // Await actual lookup processing and subsequent React/browser frames.
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart')))).toEqual(current);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('proto_cart')))).toEqual(current);
    expect(safety.blockedRequests).toEqual([]);
  });
}
