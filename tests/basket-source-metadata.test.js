import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { cartPayload, parseCartMutation } from '../api/account-cart.js';
import { availabilityForRow } from '../api/_product-availability.js';
import { enrichMotarroCategoryFields } from '../lib/mottaro-category.mjs';
import { mergeCategoryPaths } from '../lib/placements.mjs';
import { customerFacingCataloguePrice } from '../lib/catalogue-price.mjs';
import { normalizeUnitsOfIssue, sellingUnitDetails } from '../lib/selling-unit.mjs';
import { addBasketLine, mergeBasketLines } from '../lib/basket-lines.mjs';

const now = 1_800_000_000_000;
const line = (source, qty = 2, extra = {}) => ({
  product: { id: 'SKU-1', sku: 'SKU-1', name: 'Original name', stockQty: 50,
    ...(source === undefined ? {} : { source }), ...extra },
  preference: ' Dark  blue ', qty,
});
const save = (items) => parseCartMutation({ mode: 'save', revision: 7, activityAt: now, items }, { now });

test('actual Main catalogue adapter emits source metadata on mapped stock rows', () => {
  const source = readFileSync(new URL('../api/products.js', import.meta.url), 'utf8');
  const helpers = ['parseSubcategoryExtra', 'labelToSlug'].map((name) => {
    const match = source.match(new RegExp(`function ${name}\\([^]*?\\n}`));
    assert.ok(match, `${name} remains available to the adapter`);
    return match[0];
  }).join('\n');
  const adapter = source.slice(source.indexOf('function adapt('), source.indexOf('export default async function handler'));
  assert.ok(adapter.startsWith('function adapt('));
  const adapt = runInNewContext(`${helpers}\n${adapter}\nadapt`, {
    normalizeUnitsOfIssue, sellingUnitDetails, customerFacingCataloguePrice,
    availabilityForRow, enrichMotarroCategoryFields, mergeCategoryPaths,
  });
  const mapped = adapt({ sku: 'SKU-1', barcode: 'BAR-1', title: 'Mapped Main product',
    category: 'Stationery', stock_qty: 0, available_stock: 0, to_order: false }, []);
  assert.equal(mapped.source, 'main');
  assert.equal(mapped.sku, 'SKU-1');
  assert.equal(mapped.stockOnHand, 0);
  assert.equal(mapped.toOrder, false);
  assert.equal(save([{ product: mapped, qty: 2 }]).items[0].product.source, 'main');
});

test('account save/read retains only explicit recognized source without restoring routing flags', () => {
  for (const source of ['main', 'instore']) {
    const saved = save([line(source)]);
    const loaded = cartPayload({ items: saved.items, activity_at: now, revision: 8 });
    assert.equal(saved.items[0].product.source, source);
    assert.equal(loaded.items[0].product.source, source);
    assert.equal(loaded.items[0].qty, 2);
    assert.equal(loaded.items[0].preference, 'Dark  blue');
    assert.equal(Object.hasOwn(loaded.items[0].product, 'isExtendedRange'), false);
  }
  assert.equal(save([line('instore', 2, { isExtendedRange: true })]).items[0].product.source, 'instore');
});

test('legacy, malformed and contradictory sources remain unknown across saves and reads', () => {
  for (const extra of [{}, { isExtendedRange: false }, { isExtendedRange: true },
    { source: 'MAIN' }, { source: ' main ' }, { source: null }, { source: 1 },
    { source: 'other' }, { source: 'main', isExtendedRange: true }]) {
    const input = line(undefined, 3, extra);
    for (const result of [save([input]), cartPayload({ items: [input], revision: 7 })]) {
      assert.equal(Object.hasOwn(result.items[0].product, 'source'), false);
      assert.equal(result.items[0].qty, 3);
    }
  }
});

test('mixed-source canonical merges preserve every quantity and first display data without eligibility', () => {
  for (const sources of [['main', 'instore'], ['instore', 'main'], ['main', undefined],
    [undefined, 'main'], ['main', 'other'], ['main', undefined, 'main']]) {
    const original = sources.map((source, index) => ({
      ...line(source, index + 2),
      preference: index ? 'dark blue' : ' Dark  blue ',
      product: { ...line(source).product, id: index ? ' sku-1 ' : 'SKU-1', name: `Name ${index}` },
    }));
    const snapshot = structuredClone(original);
    const merged = mergeBasketLines(original);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].qty, original.reduce((sum, item) => sum + item.qty, 0));
    assert.equal(merged[0].preference, 'Dark  blue');
    assert.equal(merged[0].product.name, 'Name 0');
    assert.equal(Object.hasOwn(merged[0].product, 'source'), false);
    assert.deepEqual(original, snapshot);
    assert.equal(Object.hasOwn(save(merged).items[0].product, 'source'), false);
    assert.equal(Object.hasOwn(cartPayload({ items: original }).items[0].product, 'source'), false);
  }
});

test('consistent sources remain known; contradictory duplicate evidence becomes unknown', () => {
  for (const source of ['main', 'instore']) {
    assert.equal(mergeBasketLines([line(source, 2), line(source, 3)])[0].product.source, source);
  }
  const merged = mergeBasketLines([line('main', 2), line('main', 3, { isExtendedRange: true })]);
  assert.equal(merged[0].qty, 5);
  assert.equal(Object.hasOwn(merged[0].product, 'source'), false);
});

test('adding to an existing canonical line conservatively merges source evidence without changing caps', () => {
  for (const source of ['instore', undefined]) {
    const original = [line('main', 2)];
    const result = addBasketLine(original, line(source, 3), { quantityCapForProduct: () => 50 });
    assert.equal(result.addedQty, 3);
    assert.equal(result.reason, null);
    assert.equal(result.items[0].qty, 5);
    assert.equal(result.items[0].preference, 'Dark  blue');
    assert.equal(Object.hasOwn(result.items[0].product, 'source'), false);
    assert.equal(original[0].product.source, 'main');
    assert.equal(original[0].qty, 2);
  }
  const same = addBasketLine([line('main', 2)], line('main', 3), { quantityCapForProduct: () => 50 });
  assert.equal(same.items[0].product.source, 'main');
});
