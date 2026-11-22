import { expect, test } from '@playwright/test';
import { catalogueProducts, installAccessibilityServices, signInCatalogue } from './helpers/accessibility-services.js';

const item = (sku, extra = {}) => ({ id: sku, sku, code: sku, name: `Synthetic ${sku}`, title: `Synthetic ${sku}`, price: 24, minQty: 2, stockQty: 24, stockOnHand: 24, isExtendedRange: true, image: '/bag_black.png', ...extra });
const pack = item('BULK-PACK');
const supplier = item('KANK3101', { minQty: 1, stockQty: 0, stockOnHand: 0, toOrder: true });
const unavailable = item('BULK-EMPTY', { stockQty: 0, stockOnHand: 0 });
const unknown = item('BULK-UNKNOWN');
const products = [pack, supplier, unavailable, unknown];
const observation = (product) => ({ sku: product.sku, qty: product.stockQty, unitsOfIssue: product === pack ? 'PACK 12' : 'EACH', unitsOfIssueRaw: product === pack ? 'PKT,12' : 'EACH', unitsOfIssueSource: 'positill_live', unitsOfIssueVerified: true, availability: { state: product.toOrder ? 'to_order' : product.stockQty > 0 ? 'in_stock' : 'out_of_stock', label: product.toOrder ? 'Available to order' : product.stockQty > 0 ? 'In stock' : 'Out of stock', canOrder: product.toOrder || product.stockQty > 0 } });
async function setup(context) {
  const safety = await installAccessibilityServices(context, { products: catalogueProducts });
  await context.route('**/api/extended-range*', route => route.fulfill({ json: { products, catalogue: products, total: products.length, page: 1, pageSize: 24, tiles: [] } }));
  await context.route('**/api/stock*', route => {
    const sku = new URL(route.request().url()).searchParams.get('sku');
    const product = products.find(p => p.sku === sku);
    return route.fulfill({ status: product === unknown ? 503 : 200, json: product === unknown ? { error: 'Synthetic unavailable' } : observation(product || pack) });
  });
  return safety;
}

test('pack quantities, repeated add, feedback and saved basket survive reload', async ({ page, context }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const safety = await setup(context);
  await signInCatalogue(page);
  await page.goto('/#/instore-products');
  const card = page.locator('.instore-item .product-card').filter({ hasText: 'Synthetic BULK-PACK' });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await expect(card.getByText('Minimum 2 · Pack of 12', { exact: true })).toBeVisible();
  await expect(card.getByText('Incl. VAT · per pack', { exact: true })).toBeVisible();
  const quantity = card.getByRole('spinbutton', { name: 'Quantity for Synthetic BULK-PACK' });
  await quantity.fill('3'); await quantity.press('Enter');
  const add = card.getByRole('button', { name: 'Add to Cart', exact: true });
  await add.focus(); await page.keyboard.press('Enter');
  await expect(card.getByRole('status').filter({ hasText: 'Added 3 to your order.' })).toBeVisible();
  await expect(card.getByText('In Your Order: 3', { exact: true })).toBeVisible();
  const saved = page.waitForResponse(response => response.url().includes('/api/account-cart') && response.request().method() === 'PUT' && response.request().postDataJSON()?.items?.some(line => line.product?.id === pack.id && line.qty === 6));
  if (testInfo.project.name.startsWith('mobile')) await add.tap(); else await add.click();
  await expect(card.getByText('In Your Order: 6', { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => JSON.stringify(localStorage))).toContain('BULK-PACK');
  await saved;
  await page.reload();
  await expect(card.getByText('In Your Order: 6', { exact: true })).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  const targets = await card.locator('.qty-stepper button, .qty-stepper input, .add-button').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  for (const target of targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('bulk-pack.png'), fullPage: true });
  expect(errors).toEqual([]); expect(safety.blockedRequests.filter(p => /checkout|order/.test(p))).toEqual([]);
});

test('supplier request remains orderable while empty and unknown stock stay held', async ({ page, context }, testInfo) => {
  await setup(context); await signInCatalogue(page); await page.goto('/#/instore-products');
  const card = sku => page.locator('.instore-item .product-card').filter({ hasText: `Synthetic ${sku}` });
  await card('KANK3101').scrollIntoViewIfNeeded();
  await expect(card('KANK3101').getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await expect(card('KANK3101').getByText('Available to order', { exact: true }).first()).toBeVisible();
  await expect(card('KANK3101').getByText(/In stock:/)).toHaveCount(0);
  await card('BULK-EMPTY').scrollIntoViewIfNeeded();
  await expect(card('BULK-EMPTY').getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  await card('BULK-UNKNOWN').scrollIntoViewIfNeeded();
  await expect(card('BULK-UNKNOWN').getByText('Could not verify stock and selling unit', { exact: false })).toBeVisible();
  await expect(card('BULK-UNKNOWN').getByRole('button', { name: 'Add to Cart', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('bulk-availability.png'), fullPage: true });
});

test('combined search uses the same verified ordering controls', async ({ page, context }) => {
  await setup(context); await signInCatalogue(page); await page.goto('/#/?q=Synthetic');
  const card = page.locator('.catalog-instore-grid .product-card').filter({ hasText: 'Synthetic BULK-PACK' });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByRole('button', { name: 'Add to Cart', exact: true })).toBeEnabled();
  await card.getByRole('button', { name: 'Add to Cart', exact: true }).click();
  await expect(card.getByText('In Your Order: 2', { exact: true })).toBeVisible();
});

test('variant cards keep option selection and exact SKU when adding', async ({ page, context }) => {
  await setup(context);
  const variants = ['RED', 'BLUE'].map(colour => item(`BULK-${colour}`, { minQty: 1, colour, unitsOfIssue: 'EACH', unitsOfIssueRaw: 'EACH', unitsOfIssueSource: 'positill_live', unitsOfIssueVerified: true }));
  const group = item('BULK-OPTIONS', { minQty: 1, isVariantGroup: true, variants, variantCount: 2 });
  await context.route('**/api/extended-range*', route => route.fulfill({ json: { products: [group], catalogue: [group], total: 1, page: 1, pageSize: 24, tiles: [] } }));
  await context.route('**/api/stock*', route => {
    const sku = new URL(route.request().url()).searchParams.get('sku');
    return route.fulfill({ json: observation(variants.find(p => p.sku === sku) || pack) });
  });
  const saves = [];
  page.on('request', request => { if (request.url().includes('/api/account-cart') && request.method() === 'PUT') saves.push(request.postDataJSON()); });
  await signInCatalogue(page); await page.goto('/#/instore-products');
  const card = page.locator('.instore-item .product-card').first();
  await card.getByRole('button', { name: 'Choose option', exact: true }).click();
  const modal = page.locator('.pz-modal');
  await modal.getByRole('radio', { name: /Synthetic BULK-BLUE/ }).click();
  await expect(modal.getByRole('radio', { name: /Synthetic BULK-BLUE/ })).toHaveAttribute('aria-checked', 'true');
  await modal.getByRole('button', { name: 'Add 1 to order', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Added 1 ✓', exact: true })).toBeVisible();
  await expect.poll(() => saves.some(save => save.items?.some(line => line.product?.sku === 'BULK-BLUE' && line.qty === 1))).toBe(true);
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0);
});
