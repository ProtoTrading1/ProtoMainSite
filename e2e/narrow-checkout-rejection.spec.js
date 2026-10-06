import { expect, test } from '@playwright/test';
import { ACCOUNT_ID, catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

test.setTimeout(45000);
const products = Array.from({ length: 11 }, (_, i) => ({ ...catalogueProducts[0], id: `NARROW-${i}`, sku: `NARROW-${i}`, code: `NARROW-${i}`, name: `SYNTHETIC LINE ${i}`, title: `SYNTHETIC LINE ${i}`, price: 250 }));
const items = products.map(product => ({ product, qty: 1 }));
const key = `proto_pending_checkout_v1:${ACCOUNT_ID}`;
async function submitBasket(page) {
  await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'Review order request', exact: true }).filter({ visible: true }).click();
  await page.getByRole('button', { name: 'Continue to options', exact: true }).click();
  await page.getByRole('button', { name: 'No WhatsApp updates', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to delivery', exact: true }).click();
  await page.getByRole('button', { name: /Pick up in store/ }).click();
  await page.getByRole('button', { name: /Send order request.*no payment now/ }).click();
}
async function amendBasket(page) {
  await page.getByRole('dialog', { name: 'Choose delivery for your order request' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog', { name: 'Could not send order' }).getByRole('button', { name: 'Close', exact: true }).click();
  const drawer = page.locator('.order-drawer').filter({ visible: true }).first();
  if (!await drawer.isVisible()) await page.locator('[data-cart-trigger]').filter({ visible: true }).first().click();
  for (const product of products.slice(8)) await drawer.getByRole('button', { name: `Remove ${product.name} from cart`, exact: true }).click();
  await expect(drawer.getByText('Saved to account', { exact: true })).toBeVisible();
  await expect(drawer.getByRole('spinbutton')).toHaveCount(8);
  await page.getByRole('button', { name: 'Close cart', exact: true }).filter({ visible: true }).click();
}

for (const failure of [
  { name: 'confirmed rejection normal resubmit', status: 400, body: { error: 'Synthetic unavailable product', code: 'ORDER_PRODUCT_UNAVAILABLE', rejectedBeforeCapture: true }, amended: true, normal: true },
  { name: 'confirmed first-dispatch rejection', status: 400, body: { error: 'Synthetic unavailable product', code: 'ORDER_PRODUCT_UNAVAILABLE', rejectedBeforeCapture: true }, amended: true },
  { name: 'missing rejection marker', status: 400, body: { error: 'Synthetic unavailable product', code: 'ORDER_PRODUCT_UNAVAILABLE' }, amended: false },
  { name: 'wrong rejection status', status: 503, body: { error: 'Synthetic unavailable product', code: 'ORDER_PRODUCT_UNAVAILABLE', rejectedBeforeCapture: true }, amended: false },
  { name: 'generic 400 rejection', status: 400, body: { error: 'Synthetic unavailable product', code: 'GENERIC', rejectedBeforeCapture: true }, amended: false },
  { name: 'reference conflict', status: 409, body: { error: 'Synthetic unavailable product', code: 'ORDER_REFERENCE_CONFLICT', rejectedBeforeCapture: true }, amended: false },
]) {
  test(`11 rejected lines then 8 saved lines: ${failure.name}`, async ({ page, context }) => {
    await installAccessibilityServices(context, { products, cartItems: items });
    const posts = []; let savedItems;
    await context.route('**/api/account-cart', async route => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        if (body.mode === 'save') savedItems = body.items;
      }
      return route.fallback();
    });
    await context.route('**/api/send-order', async route => {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: posts.length === 1 ? failure.status : 200, contentType: 'application/json', body: JSON.stringify(posts.length === 1 ? failure.body : { success: true, orderId: 'inert-capture', orderNumber: 'TEST-ONE' }) });
    });
    await signInCatalogue(page); await submitBasket(page);
    await expect(page.getByRole('dialog', { name: 'Could not send order' })).toBeVisible();
    expect(posts).toHaveLength(1); expect(posts[0].items).toHaveLength(11);
    await amendBasket(page); expect(savedItems).toHaveLength(8);
    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Could not send order' })).toBeVisible();
    expect(posts).toHaveLength(1); // No background retry or fresh reference on reload.
    if (failure.normal) {
      await page.getByRole('dialog', { name: 'Could not send order' }).getByRole('button', { name: 'Close', exact: true }).click();
      await submitBasket(page);
    } else await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Order request received. Thank you.' })).toBeVisible();
    expect(posts).toHaveLength(2);
    expect(posts[1].clientRef).toBe(posts[0].clientRef);
    expect(posts[1].deliveryMethod).toBe(posts[0].deliveryMethod);
    expect(posts[1].customerNotes).toBe(posts[0].customerNotes);
    expect(posts[1].promoCode).toBe(posts[0].promoCode);
    expect(posts[1].items).toHaveLength(failure.amended ? 8 : 11);
    if (failure.amended) expect(posts[1].items.map(item => item.product.id)).toEqual(products.slice(0, 8).map(product => product.id));
    else expect(posts[1]).toEqual(posts[0]);
    expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  });
}





test('fresh price review with unchanged quantities keeps reference and sends corrected snapshots', async ({ page, context }) => {
  await installAccessibilityServices(context, { products, cartItems: items });
  const posts=[];
  await context.route('**/api/send-order', route=>{
    posts.push(route.request().postDataJSON());
    return route.fulfill({status:posts.length===1?409:200,contentType:'application/json',body:JSON.stringify(posts.length===1
      ? {error:'Synthetic new price review',code:'ORDER_REVIEW_REQUIRED',rejectedBeforeCapture:true,changes:[{sku:'NARROW-0',currentPrice:251,currentStockQty:100}]}
      : {success:true,orderId:'inert-price-capture',orderNumber:'TEST-PRICE'})});
  });
  await signInCatalogue(page);await submitBasket(page);
  await expect(page.getByRole('dialog',{name:'Your basket needs review'})).toBeVisible();
  await page.getByRole('dialog',{name:'Choose delivery for your order request'}).getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Review basket',exact:true}).click();
  const drawer=page.locator('.order-drawer').filter({visible:true}).first();
  await expect(drawer.getByText('Saved to account',{exact:true})).toBeVisible();
  await expect(drawer.getByRole('spinbutton')).toHaveCount(11);
  await page.getByRole('button',{name:'Close cart',exact:true}).filter({visible:true}).click();
  await submitBasket(page);
  await expect(page.getByRole('heading',{name:'Order request received. Thank you.'})).toBeVisible();
  expect(posts).toHaveLength(2);expect(posts[1].clientRef).toBe(posts[0].clientRef);
  expect(posts[1].items.map(item=>item.qty)).toEqual(posts[0].items.map(item=>item.qty));
  expect(posts[1].items[0].product.checkoutSnapshot.unitPrice).toBe(251);
  expect(posts[0].items[0].product.checkoutSnapshot.unitPrice).toBe(250);
  expect(posts[1].deliveryMethod).toBe(posts[0].deliveryMethod);expect(posts[1].customerNotes).toBe(posts[0].customerNotes);
});
