import { expect, test } from '@playwright/test';
import { basketLineKey } from '../lib/basket-lines.mjs';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue, syntheticSession } from './helpers/accessibility-services.js';

const historyOrder = { id: '00000000-0000-4000-8000-000000000901', customer_id: ACCOUNT_ID, order_number: 'TEST-OLD', created_at: '2026-09-21', status: 'paid', items: [{ code: 'OLD-SKU', name: 'Historical notebook', qty: 2, unitPrice: 100 }], total_ex_vat: 200, delivery_method: 'In store pick up' };
const receivedOrder = { ...historyOrder, id: '00000000-0000-4000-8000-000000000902', order_number: 'TEST-SAVED', items: [{ code: 'SAVED-SKU', name: 'Exact received clipboard', qty: 3, unitPrice: 100 }] };

async function mountProfile(page, context, target, rows) {
  const safety = await installAccessibilityServices(context);
  const calls = { history: [], writes: [] };
  await context.route('**/mock-supabase/rest/v1/orders?*', route => {
    const request = route.request(); calls.history.push(new URL(request.url()).searchParams.toString());
    return route.fulfill({ json: rows });
  });
  page.on('request', request => { const path = new URL(request.url()).pathname; if (path !== '/api/journey-analytics' && (path.startsWith('/api/') || path.startsWith('/mock-supabase/rest/')) && request.method() !== 'GET') calls.writes.push(`${request.method()} ${path}`); });
  await page.goto('/');
  await page.evaluate(async ({ target, accountId, session }) => {
    const [react, dom, { default: Profile }, auth, { supabase }, targets] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'), import('/src/pages/ProfilePage.jsx'),
      import('/src/lib/authHeaders.js'), import('/src/lib/supabase.js'), import('/src/lib/orderReceiptTarget.mjs')]);
    await supabase.auth.initialize(); auth.rememberAuthSession(session);
    const container = document.createElement('div'); container.id = 'receipt-profile-fixture'; document.body.appendChild(container);
    const receiptTarget = targets.createOrderReceiptTarget({ ...target, customerId: accountId }, accountId, auth.captureAuthIdentity());
    (dom.default ?? dom).createRoot(container).render((react.default ?? react).createElement(Profile, { customer: { id: accountId, name: 'Synthetic customer', email: 'synthetic@example.invalid' }, receiptTarget, onBack: () => {} }));
  }, { target, accountId: ACCOUNT_ID, session: syntheticSession() });
  await expect(page.locator('#receipt-profile-fixture').getByRole('heading', { name: 'My orders', exact: true })).toBeVisible();
  return { safety, calls, profile: page.locator('#receipt-profile-fixture') };
}

test('exact received order opens its own details even with an unrelated processed order in history', async ({ page, context }) => {
  const f = await mountProfile(page, context, { kind: 'received', orderId: receivedOrder.id, orderNumber: receivedOrder.order_number }, [historyOrder, receivedOrder]);
  const received = f.profile.getByRole('article', { name: 'Confirmed order TEST-SAVED' });
  await expect(received.getByRole('button', { name: 'Hide', exact: true })).toBeVisible();
  await expect(received.getByText('Exact received clipboard', { exact: true })).toBeVisible();
  await expect(f.profile.getByText('Historical notebook', { exact: true })).toHaveCount(0);
  expect(f.calls.history).toHaveLength(1); expect(f.calls.history[0]).toContain(`customer_id=eq.${ACCOUNT_ID}`);
  expect(f.calls.writes).toEqual([]); expect(f.safety.blockedRequests).toEqual([]);
});

test('receipt outside recent history reports unavailable and never substitutes the processed order', async ({ page, context }) => {
  const f = await mountProfile(page, context, { kind: 'received', orderId: receivedOrder.id, orderNumber: receivedOrder.order_number }, [historyOrder]);
  await expect(f.profile.getByText(/confirmed receipt TEST-SAVED is not available/)).toBeVisible();
  await expect(f.profile.getByText('TEST-OLD', { exact: true })).toBeVisible();
  await expect(f.profile.locator('button[aria-expanded="true"]')).toHaveCount(0);
  expect(f.calls.writes).toEqual([]); expect(f.calls.history).toHaveLength(1);
});

test('unconfirmed new request explains that historical processed orders do not prove acceptance', async ({ page, context }) => {
  const f = await mountProfile(page, context, { kind: 'unconfirmed' }, [historyOrder]);
  await expect(f.profile.getByText(/Previous orders below do not confirm that it was received/)).toBeVisible();
  await expect(f.profile.getByText('TEST-OLD', { exact: true })).toBeVisible();
  await expect(f.profile.locator('button[aria-expanded="true"]')).toHaveCount(0);
  expect(f.calls.writes).toEqual([]); expect(f.calls.history).toHaveLength(1);
});


for (const sameBasket of [false, true]) test(`actual Root routes a read-only recovery receipt to its exact order while retaining the ${sameBasket ? 'same' : 'newer'} basket`, async ({ page, context }) => {
  const original = { product: catalogueProducts[0], qty: 20, preference: 'Blue' };
  const newer = { product: catalogueProducts[1], qty: 21, preference: 'Pink' };
  const current = sameBasket ? original : newer;
  await installAccessibilityServices(context, { cartItems: [current] });
  const sends = [], checks = [], writes = [];
  await context.route('**/api/send-order', route => { sends.push(route.request().postDataJSON()); return route.abort(); });
  await context.route('**/api/checkout-recovery', route => { checks.push(route.request().postDataJSON()); return route.fulfill({ json: { state: 'received', success: true, orderId: receivedOrder.id, orderNumber: receivedOrder.order_number, deliveryUnchecked: true } }); });
  await context.route('**/mock-supabase/rest/v1/orders?*', route => route.fulfill({ json: new URL(route.request().url()).searchParams.get('limit') === '10' ? [historyOrder, receivedOrder] : [] }));
  page.on('request', request => { if (checks.length && new URL(request.url()).pathname === '/api/account-cart' && (request.method() === 'DELETE' || (request.method() === 'PUT' && request.postDataJSON()?.mode !== 'touch'))) writes.push(request.method()); });
  await signInCatalogue(page);
  const key = `proto_pending_checkout_v1:${ACCOUNT_ID}`;
  const record = { version: 1, customerId: ACCOUNT_ID,
    payload: { clientRef: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', deliveryMethod: 'In store pick up', customerNotes: 'Synthetic original notes', promoCode: null,
      items: [{ qty: 20, preference: 'Blue', product: { id: original.product.id, sku: original.product.sku, code: original.product.code, name: original.product.name, source: 'main', isExtendedRange: false, checkoutSnapshot: { unitPrice: 79.5, stockQty: 100 } } }] },
    items: [original], total: 1590, fingerprint: JSON.stringify([[basketLineKey(original), 20]]), options: { courierChoice: 'pickup', customerNotes: 'Synthetic original notes', promo: null } };
  await page.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), { key, record });
  await page.reload(); await page.getByRole('button', { name: 'Check saved request', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved request received', exact: true })).toBeVisible();
  if (sameBasket) {
    await expect(page.getByRole('dialog').getByText(/This basket matches that received request and has been kept/)).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Review current basket', exact: true })).toHaveCount(0);
  }
  await page.getByRole('dialog').getByRole('button', { name: 'View order', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Confirmed order TEST-SAVED' }).getByText('Exact received clipboard', { exact: true })).toBeVisible();
  await expect(page.getByText('Historical notebook', { exact: true })).toHaveCount(0);
  expect(checks).toEqual([record.payload]); expect(sends).toEqual([]); expect(writes).toEqual([]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).payload, key)).toEqual(record.payload);
  await page.getByRole('button', { name: /Back to Portal/ }).click();
  await expect(page.getByRole('heading', { name: 'Saved request needs confirmation', exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(page.locator('.order-drawer').filter({ visible: true }).first().getByRole('spinbutton', { name: `Quantity for ${current.product.code} (${current.preference})`, exact: true })).toHaveValue(String(current.qty));
});

