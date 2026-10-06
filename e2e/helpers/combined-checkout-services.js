import { createHash } from 'node:crypto';
import { expect } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, syntheticSession } from './accessibility-services.js';

export { ACCOUNT_ID, syntheticSession };
export const product = { ...catalogueProducts[0], source: 'main', isExtendedRange: false };
export const pendingKey = `proto_pending_checkout_v1:${ACCOUNT_ID}`;
export const legacyKey = `proto_checkout_attempt_${ACCOUNT_ID}`;
export const app = page => page.locator('#combined-checkout-app');
export const drawer = page => app(page).locator('.order-drawer').filter({ visible: true }).first();
export const receipt = page => page.getByRole('dialog', { name: 'Order request received. Thank you.', exact: true });
export const failure = page => page.getByRole('dialog', { name: 'Could not send order', exact: true });

// Independent V3 server model: reference reuse also requires the original
// snapshots. Deliberately do not import the implementation under test here.
export function independentRequestHash(body) {
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const unitPrice = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.round(Number(value) * 100) / 100 : null;
  const stockQty = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Math.max(0, Math.floor(Number(value)));
  return createHash('sha256').update(JSON.stringify({ version: 1,
    deliveryMethod: clean(body.deliveryMethod), customerNotes: clean(body.customerNotes), promoCode: clean(body.promoCode).toUpperCase(),
    items: body.items.map(({ product: p, qty, preference }) => ({ sku: clean(p.sku || p.id).toUpperCase(),
      barcode: clean(p.code || p.barcode), instore: p.isExtendedRange === true, qty: Number(qty), preference: Array.from(String(preference ?? '')).map(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char).join('').trim(),
      snapshot: { unitPrice: unitPrice(p.checkoutSnapshot?.unitPrice), stockQty: stockQty(p.checkoutSnapshot?.stockQty) } })),
  })).digest('hex');
}

export async function fixture(context, { cartItems = [{ product, qty: 20 }], products = [product] } = {}) {
  const safety = await installAccessibilityServices(context, { products });
  await context.addInitScript(() => {
    window.__combinedStorageMode = '';
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
    window.__combinedRawRead = key => get.call(localStorage, key);
    window.__combinedRawWrite = (key, value) => set.call(localStorage, key, value);
    Storage.prototype.setItem = function (key, value) {
      const mode = window.__combinedStorageMode;
      if (mode === 'all-denied') throw new DOMException('Synthetic storage denial', 'SecurityError');
      if (['journal-silent', 'compound-silent'].includes(mode) && (key.startsWith('proto_cart_pending_') || key.startsWith('proto_cart_recovery:'))) return;
      if (['checkout-silent', 'compound-silent'].includes(mode) && key.startsWith('proto_pending_checkout_v1:')) return;
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function (key) {
      if (window.__combinedStorageMode === 'all-denied') throw new DOMException('Synthetic storage denial', 'SecurityError');
      return remove.call(this, key);
    };
  });
  const cart = { items: structuredClone(cartItems), revision: 1, activityAt: Date.now() };
  const state = { cart, posts: [], captures: new Map(), deletes: 0, failDelete: false, respond: null, safety };
  await context.route('**/api/account-cart', route => {
    const request = route.request();
    if (request.method() === 'DELETE') {
      state.deletes++;
      if (state.failDelete) return route.fulfill({ status: 503, json: { error: 'Synthetic clear failure' } });
      cart.items = []; cart.activityAt = null; cart.revision++;
    } else if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      if (body.mode === 'save') { cart.items = body.items; cart.activityAt = body.activityAt; cart.revision++; }
    }
    return route.fulfill({ json: cart });
  });
  state.accept = (route, body) => {
    const hash = independentRequestHash(body), existing = state.captures.get(body.clientRef);
    if (existing && existing.hash !== hash) return route.fulfill({ status: 409, json: { code: 'ORDER_REFERENCE_CONFLICT', error: 'Synthetic V3 payload or snapshot conflict' } });
    if (!existing) state.captures.set(body.clientRef, { hash, orderId: `SYNTHETIC-${state.captures.size + 1}` });
    return route.fulfill({ json: { success: true, orderId: state.captures.get(body.clientRef).orderId, orderNumber: state.captures.get(body.clientRef).orderId } });
  };
  await context.route('**/api/send-order', async route => {
    const body = route.request().postDataJSON(); state.posts.push(body);
    return state.respond ? state.respond(route, body) : state.accept(route, body);
  });
  return state;
}

export async function mount(page) {
  await page.goto('/');
  await page.evaluate(async settings => {
    const [react, dom, { default: App }, { rememberAuthSession }, { supabase }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/src/App.jsx'), import('/src/lib/authHeaders.js'), import('/src/lib/supabase.js')]);
    await supabase.auth.initialize();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    rememberAuthSession(settings.session);
    const container = document.createElement('div'); container.id = 'combined-checkout-app'; document.body.appendChild(container);
    (dom.default ?? dom).createRoot(container).render((react.default ?? react).createElement(App, { customer: {
      id: settings.accountId, name: 'Synthetic checkout customer', email: 'checkout@example.invalid',
      is_approved: true, role: 'customer', accept_whatsapp: false } }));
  }, { session: syntheticSession(), accountId: ACCOUNT_ID });
  await expect(app(page).locator('.product-card').first()).toBeVisible();
}

export async function openBasket(page) {
  await app(page).locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await expect(drawer(page).getByText('Saved to account', { exact: true })).toBeVisible();
}
export async function prepare(page) {
  if (!(await drawer(page).isVisible())) await openBasket(page);
  await drawer(page).getByRole('button', { name: 'Review order request', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review your order request', exact: true }).getByRole('button', { name: 'Continue to options', exact: true }).click();
  await page.getByRole('dialog', { name: 'Order request options', exact: true }).getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  await page.getByRole('dialog', { name: 'Choose delivery for your order request', exact: true }).getByRole('button', { name: /Pick up in store/ }).click();
}
export async function send(page) {
  await page.getByRole('dialog', { name: 'Choose delivery for your order request', exact: true }).getByRole('button', { name: /^Send order request.*no payment now$/ }).click();
}
export const readPending = page => page.evaluate(key => { const raw = window.__combinedRawRead(key); return raw ? JSON.parse(raw) : null; }, pendingKey);
