import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { knownCartProductSource, verifiedReorderProduct } from '../../src/lib/cartProductRecovery.mjs';
import { addBasketLine, mergeBasketLines } from '../../lib/basket-lines.mjs';
import { itemPreferenceFields } from '../../lib/item-preference.mjs';

const root = join(import.meta.dirname, '..', '..');
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');
const productsLibSrc = readFileSync(join(root, 'src/lib/products.js'), 'utf8');
const productsApiSrc = readFileSync(join(root, 'api/products.js'), 'utf8');

function reorderHarness({ cartItems = [], products = new Map() } = {}) {
  const handler = appSrc.match(/const handleReorder = (async \(items[^\n]*\) => \{[\s\S]*?\r?\n {2}});/);
  assert.ok(handler, 'the actual App reorder handler can be checked independently');
  const identity = { userId: 'synthetic-account' };
  const currentCartRef = { current: { items: cartItems, activityAt: 1 } };
  const changes = { basket: [], activity: 0, modal: [], lookups: [] };
  const reorder = runInNewContext(`(${handler[1]})`, {
    captureAuthIdentity: () => identity,
    customer: { id: 'synthetic-account' }, cartAccountRef: { current: 'synthetic-account' },
    cartHydratedRef: { current: true },
    canChangeBasket: () => true, flushSync: action => action(), currentCartRef,
    cartRevisionRef: { current: 7 }, pendingJournalRef: { current: { raw: null } },
    pendingCheckoutRef: { current: null }, lastCheckoutOptionsRef: { current: null },
    cartConflictRef: { current: false }, cartSyncInFlightRef: { current: false },
    fetchProductsBySkus: async keys => { changes.lookups.push(Array.from(keys)); return products; },
    fetchInstoreProductsBySkus: async () => new Map(), knownCartProductSource,
    catalogProducts: [], cartItems, verifiedReorderProduct, mergeBasketLines, addBasketLine, itemPreferenceFields,
    cartQtyCapForProduct: product => product.stockQty ?? 9999,
    MAX_CART_LINES: 250,
    setCartItems: updater => { const next = updater(currentCartRef.current.items);
      currentCartRef.current = { ...currentCartRef.current, items: next }; changes.basket.push(next); },
    markCartActivity: () => { changes.activity++; },
    setReorderModal: value => { changes.modal.push(value); },
  });
  return { reorder, changes };
}

const plain = value => JSON.parse(JSON.stringify(value));

// Reorder resolved products against `catalogProducts` — a single 60-product
// page, narrowed further by the active category/search/in-stock filter. A
// 160-line reorder therefore added only what happened to be on screen and
// dropped the rest silently via .filter(Boolean).

test('reorder resolves products through the API, not the current catalogue page', () => {
  assert.match(appSrc, /const handleReorder = async \(items,/, 'reorder is async so it can look products up');
  assert.match(appSrc, /fetchProductsBySkus\(mainItems\.map/, 'reorder resolves Main SKUs through their own catalogue');
  assert.match(appSrc, /fetchInstoreProductsBySkus\(instoreItems\.map/, 'Instore SKUs use their own verified route');
  assert.doesNotMatch(
    appSrc,
    /const selectedItems = items\s*\n?\s*\.map\(\(item\) => \{\s*\n?\s*const product = catalogProducts\.find/,
    'reorder no longer matches only against the loaded page',
  );
});

test('actual reorder preserves unresolved and source-review lines without mutating the basket', async () => {
  assert.match(appSrc, /return \{ added, missing, overflow \}/, 'the caller is told what happened');
  assert.match(appSrc, /if \(!missing\.length && !overflow\) setReorderModal\(false\)/, 'the modal stays open when something failed');
  const unavailable = { productId: 'MISSING', code: 'MISSING', source: 'main', isExtendedRange: false, qty: 2, preference: 'Blue' };
  const historical = { productId: 'COLLISION', code: 'COLLISION', name: 'Historical item', qty: 4, preference: 'Red', unitPrice: 17 };
  const conflicting = { ...historical, preference: 'Green', source: 'main', isExtendedRange: true };
  const wrongSource = { ...historical, preference: 'Yellow', source: 'instore', isExtendedRange: true };
  const currentBasket = [{ product: { id: 'KEPT', source: 'main', isExtendedRange: false }, qty: 3 }];
  const before = JSON.stringify(currentBasket);
  const originalItems = [unavailable, historical, conflicting, wrongSource];
  const originals = JSON.stringify(originalItems);
  const { reorder, changes } = reorderHarness({ cartItems: currentBasket,
    products: new Map([['COLLISION', { id: 'COLLISION', code: 'COLLISION', name: 'Current main item' }]]) });
  const result = await reorder(originalItems);
  assert.equal(result.added, 0);
  assert.equal(result.overflow, 0);
  assert.equal(result.missing[0], unavailable, 'an unavailable line retains its original record');
  assert.deepEqual(plain(result.missing.slice(1)), [historical, conflicting]
    .map(item => ({ ...item, reason: 'source_review_required' })).concat(wrongSource));
  assert.equal(changes.basket.length, 0, 'a matching main SKU cannot bless historical source or replace the basket');
  assert.equal(changes.activity, 0);
  assert.deepEqual(changes.modal, [], 'review remains open and actionable');
  assert.equal(JSON.stringify(currentBasket), before);
  assert.equal(JSON.stringify(originalItems), originals);
  assert.deepEqual(changes.lookups[0], ['MISSING']);
});

test('actual reorder preserves verified preference lines and reports the aggregate stock remainder', async () => {
  const product = { id: 'COLOURS', code: 'COLOURS', minQty: 1, stockQty: 10 };
  const currentBasket = [{ product: { ...product, source: 'main', isExtendedRange: false }, qty: 2, preference: 'Red' }];
  const before = JSON.stringify(currentBasket);
  const items = [{ productId: 'COLOURS', source: 'main', qty: 3, preference: ' red ' },
    { productId: 'COLOURS', source: 'main', qty: 6, preference: 'Blue' }];
  const { reorder, changes } = reorderHarness({ cartItems: currentBasket, products: new Map([['COLOURS', product]]) });
  const result = await reorder(items);
  assert.equal(result.added, 2);
  assert.equal(result.overflow, 0);
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].reason, 'stock_limit');
  assert.equal(result.missing[0].productId, 'COLOURS');
  assert.equal(result.missing[0].preference, 'Blue');
  assert.equal(result.missing[0].qty, 6, 'the review result retains the original requested quantity');
  assert.deepEqual(changes.basket[0].map(({ qty, preference }) => ({ qty, preference })),
    [{ qty: 5, preference: 'Red' }, { qty: 5, preference: 'Blue' }]);
  assert.equal(changes.activity, 1);
  assert.deepEqual(changes.modal, []);
  assert.equal(JSON.stringify(currentBasket), before);
});

test('actual reorder permits an existing preference at 250 lines and reports overflow for a new one', async () => {
  const currentBasket = Array.from({ length: 250 }, (_, index) => ({
    product: { id: `SKU-${index}`, source: 'main', isExtendedRange: false, stockQty: 20 }, qty: 1,
  }));
  const products = new Map([['SKU-0', { id: 'SKU-0', stockQty: 20 }], ['EXTRA', { id: 'EXTRA', stockQty: 20 }]]);
  const { reorder, changes } = reorderHarness({ cartItems: currentBasket, products });
  const result = await reorder([{ productId: 'SKU-0', source: 'main', qty: 2 },
    { productId: 'EXTRA', source: 'main', qty: 1 }]);
  assert.equal(result.added, 1);
  assert.equal(result.overflow, 1);
  assert.deepEqual(plain(result.missing), []);
  assert.equal(changes.basket[0].length, 250);
  assert.equal(changes.basket[0][0].qty, 3);
  assert.equal(currentBasket[0].qty, 1);
  assert.equal(changes.activity, 1);
  assert.deepEqual(changes.modal, [], 'overflow keeps the reorder modal open');
});

test('the cart cannot be pushed past the server line limit', () => {
  assert.match(appSrc, /const MAX_CART_LINES = 250/, 'client mirrors MAX_ORDER_LINES');
  assert.match(appSrc, /maxLines: MAX_CART_LINES/, 'the shared line resolver receives the server limit');
  assert.match(appSrc, /if \(result.reason === 'line_limit'\) overflow \+= 1/, 'overflow is counted, not silently added');
});

test('sku lookup batches, tolerates a failed batch, and is bounded server-side', () => {
  assert.match(productsLibSrc, /export async function fetchProductsBySkus/, 'helper exists');
  assert.match(productsLibSrc, /Promise\.allSettled/, 'one failed batch does not lose the others');
  assert.match(productsApiSrc, /MAX_SKUS_PER_REQUEST = 200/, 'server bounds the IN(...) list');
  assert.match(productsApiSrc, /\.slice\(0, MAX_SKUS_PER_REQUEST\)/, 'the bound is applied');
});
