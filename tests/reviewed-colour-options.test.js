import test from 'node:test';
import assert from 'node:assert/strict';
import { SARONGI_GALLERIES } from '../lib/sarongi-instore-gallery-data.mjs';
import { reviewedColourOptions, withReviewedColourPhoto, reviewedColourOrderImage, supplierStockAvailable, supplierNamedOptionAvailable } from '../lib/reviewed-colour-options.mjs';
import { addBasketLine } from '../lib/basket-lines.mjs';
import { parseCartMutation, cartPayload } from '../api/account-cart.js';
import { buildOrderEmailHtml, resolveAuthoritativePrices } from '../api/send-order.js';
import process from 'node:process';

const productFor = sku => {
  const images = SARONGI_GALLERIES[sku].map(p => 'https://www.proto.co.za' + p.path);
  return { id: sku, sku, code: sku, barcode: sku, name: 'Reviewed product', price: 11.5,
    stockQty: 49, stockOnHand: 49, unitsOfIssue: 'EACH', image: images[0], images };
};

test('all reviewed sets retain identity and balances when first, middle and last colours are chosen', () => {
  for (const [sku, photos] of Object.entries(SARONGI_GALLERIES)) {
    if (photos.length < 2) continue;
    const product = productFor(sku), options = reviewedColourOptions(product);
    assert.equal(options.length, photos.length);
    for (const option of [options[0], options[Math.floor(options.length / 2)], options.at(-1)]) {
      const selected = withReviewedColourPhoto(product, option.label);
      for (const field of ['id', 'sku', 'code', 'barcode', 'price', 'stockQty', 'stockOnHand', 'unitsOfIssue']) assert.equal(selected[field], product[field]);
      assert.equal(selected.image, option.image);
      assert.equal(selected.remoteImage, option.image);
      assert.equal(selected.images.length, photos.length);
      assert.equal(reviewedColourOrderImage(sku, product.image, option.label), option.image);
    }
  }
});

test('KBRA2003 has five choices and only White receives the supplied stock-list badge', () => {
  const options = reviewedColourOptions(productFor('KBRA2003'));
  assert.deepEqual(options.map(p => p.label), ['Black', 'Blue', 'Brown', 'Purple', 'White']);
  assert.deepEqual(options.filter(p => p.stockAvailable).map(p => p.label), ['White']);
});

test('corrected Brown/Beige and Blue and brown/White and brown labels follow exact photos', () => {
  assert.deepEqual(reviewedColourOptions(productFor('KBRA3010')).map(p => p.label), ['Brown', 'Beige']);
  assert.deepEqual(new Set(reviewedColourOptions(productFor('KBRA6008')).map(p => p.label)), new Set(['Blue and brown', 'White and brown']));
});

test('hidden, replaced, partial and unrelated galleries do not create colour options', () => {
  const p = productFor('KBRA2003');
  for (const changed of [{ ...p, imageStatus: 'hidden' }, { ...p, image: 'https://example.test/replaced.jpg' },
    { ...p, images: p.images.slice(0, 4) }, { ...p, sku: 'OTHER' }, { ...p, isVariantGroup: true }]) assert.deepEqual(reviewedColourOptions(changed), []);
  assert.equal(reviewedColourOrderImage('KBRA2003', 'https://example.test/replaced.jpg', 'White'), 'https://example.test/replaced.jpg');
});

test('two colour lines share the 49-unit cap and survive account basket serialization with chosen images', () => {
  const p = productFor('KBRA2003');
  let basket = addBasketLine([], { product: withReviewedColourPhoto(p, 'Black'), qty: 30, preference: 'Black' }, { quantityCapForProduct: p => p.stockOnHand }).items;
  basket = addBasketLine(basket, { product: withReviewedColourPhoto(p, 'White'), qty: 30, preference: 'White' }, { quantityCapForProduct: p => p.stockOnHand }).items;
  assert.deepEqual(basket.map(p => p.qty), [30, 19]);
  const now = 1800000000000;
  const saved = cartPayload({ items: parseCartMutation({ mode: 'save', revision: 1, activityAt: now, items: basket }, { now }).items, revision: 2, activity_at: now });
  assert.deepEqual(saved.items.map(p => p.preference), ['Black', 'White']);
  assert.notEqual(saved.items[0].product.image, saved.items[1].product.image);
});

test('supplier badges are dated evidence and never alter stock, units or price', () => {
  const p = { id: 'X-WHI1001', sku: 'X-WHI1001', stockQty: -3, price: 10, unitsOfIssue: '5PC' };
  const before = structuredClone(p);
  assert.equal(supplierStockAvailable(p), true);
  assert.deepEqual(p, before);
  assert.equal(supplierStockAvailable({ ...p, imageStatus: 'hidden' }), false);
  assert.equal(supplierStockAvailable({ ...p, sku: 'OTHER' }), false);
});

test('order emails retain and escape the chosen preference', () => {
  const html = buildOrderEmailHtml({ customer: { company: 'Test' }, items: [{ product: productFor('KBRA2003'), qty: 1, preference: 'White <script>' }], subtotal: 11.5 });
  assert.match(html, /White &lt;script&gt;/);
  assert.doesNotMatch(html, /White <script>/);
});

test('existing turtle colours receive only the three exact supplier-list matches', () => {
  assert.equal(supplierNamedOptionAvailable('KBRA2013','Brown'),false);
  for (const label of ['Black','Turquoise','White']) assert.equal(supplierNamedOptionAvailable('KBRA2013',label),true);
});

test('authoritative checkout rebuilds selected images from approved photos and preserves real prices and units', async () => {
  const original = { fetch: globalThis.fetch, url: process.env.VITE_STOCK_SUPABASE_URL, key: process.env.VITE_STOCK_SUPABASE_KEY };
  const p=productFor('KBRA2003');
  const stock={sku:p.sku,barcode:p.sku,title:p.name,price:11.5,units_of_issue:'EACH',min_order_qty:1,available_stock:49,stock_qty:49,image_url_one:p.image};
  process.env.VITE_STOCK_SUPABASE_URL='https://synthetic-checkout.invalid';
  process.env.VITE_STOCK_SUPABASE_KEY='synthetic';
  globalThis.fetch=async input=>{
    const url=new URL(typeof input==='string'?input:input.url);
    assert.equal(url.hostname,'synthetic-checkout.invalid');
    const data=url.pathname.endsWith('/website_stock')?[stock]:url.pathname.endsWith('/get_website_product_availability')?[]:null;
    assert.notEqual(data,null);return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
  };
  try {
    const items=await resolveAuthoritativePrices(['White','Black'].map(preference=>({qty:1,preference,product:{sku:p.sku,price:0.01,checkoutSnapshot:{unitPrice:11.5,stockQty:49},image:'https://untrusted.invalid/wrong.jpg'}})),{classify:async()=>new Set()});
    assert.deepEqual(items.map(i=>i.preference),['White','Black']);
    for (const i of items) {
      assert.equal(i.product.image,withReviewedColourPhoto(p,i.preference).image);
      assert.equal(i.product.price,11.5);assert.equal(i.product.unitsOfIssue,'EACH');assert.equal(i.product.sku,p.sku);
    }
  } finally {
    globalThis.fetch=original.fetch;
    for(const [key,value] of [['VITE_STOCK_SUPABASE_URL',original.url],['VITE_STOCK_SUPABASE_KEY',original.key]]) { if(value===undefined)delete process.env[key];else process.env[key]=value; }
  }
});
