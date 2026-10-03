import test from 'node:test';
import assert from 'node:assert/strict';
import { cartProductsNeedReview, freshCartProduct, recoverCartProducts, verifiedReorderProduct } from '../src/lib/cartProductRecovery.mjs';
import { addBasketLine, basketLineKey, mergeBasketLines } from '../lib/basket-lines.mjs';

const legacy = { product: { id: 'OLD', code: 'OLD', name: 'Instore sounding name', price: 500 }, qty: 3, preference: 'Blue' };

test('failed lookup keeps legacy basket and preferences without guessing its source', () => {
  const recovered = recoverCartProducts([legacy]);
  assert.equal(cartProductsNeedReview(recovered), true);
  assert.deepEqual(recovered[0].product, legacy.product);
  assert.equal(recovered[0].qty, 3);
  assert.equal(recovered[0].preference, 'Blue');
  assert.equal(recovered[0].product.isExtendedRange, undefined);
  assert.equal(legacy.accountProductNeedsReview, undefined);
});

test('partial authoritative main lookup restores MOQ and units while preserving unresolved lines', () => {
  const live = { id: 'MAIN', code: 'MAIN', minQty: 6, unitsOfIssue: 'PACK12', price: 40 };
  const recovered = recoverCartProducts([legacy, { product: { code: 'main', source: 'main', isExtendedRange: false }, qty: 6 }], new Map([['MAIN', live]]));
  assert.equal(cartProductsNeedReview(recovered), true);
  assert.equal(recovered[1].accountProductNeedsReview, undefined);
  assert.equal(recovered[1].product.minQty, 6);
  assert.equal(recovered[1].product.unitsOfIssue, 'PACK12');
  assert.equal(recovered[1].product.isExtendedRange, false);
  assert.equal(cartProductsNeedReview(recovered.slice(1)), false);
});

test('explicit saved Instore flag survives a colliding main lookup and keeps validation hints', () => {
  const product = { ...legacy.product, isExtendedRange: true, source: 'instore', minQty: 2, unitsOfIssue: 'PAIR' };
  const recovered = recoverCartProducts([{ ...legacy, product, accountProductNeedsReview: true }], new Map([['OLD', { code: 'OLD', minQty: 1 }]]));
  assert.deepEqual(recovered[0].product, product);
  assert.equal(cartProductsNeedReview(recovered), false);
});

test('explicit source alone restores source flag while missing or invalid hints remain unknown', () => {
  for (const source of ['main', 'instore']) {
    const recovered = recoverCartProducts([{ ...legacy, product: { ...legacy.product, source } }]);
    assert.equal(cartProductsNeedReview(recovered), false);
    assert.equal(recovered[0].product.isExtendedRange, source === 'instore');
  }
  assert.equal(cartProductsNeedReview(recoverCartProducts([{ ...legacy, product: { ...legacy.product, source: 'unknown', isExtendedRange: 'true' } }])), true);
});

test('explicit provenance permits authoritative recovery; fresh catalogue additions persist known provenance', () => {
  const pending = recoverCartProducts([{ ...legacy, product: { ...legacy.product, source: 'main' }, accountProductNeedsReview: true }]);
  const resolved = recoverCartProducts(pending, new Map([['OLD', { code: 'OLD', minQty: 4, unitsOfIssue: 'PACK4' }]]));
  assert.equal(cartProductsNeedReview(resolved), false);
  assert.equal(cartProductsNeedReview([legacy]), true);
  assert.deepEqual(freshCartProduct(legacy.product), legacy.product);
  const fresh = freshCartProduct(legacy.product, 'main');
  assert.equal(fresh.source, 'main');
  assert.equal(fresh.isExtendedRange, false);
  assert.equal(cartProductsNeedReview(recoverCartProducts([{ ...legacy, product: fresh }])), false);
  assert.equal(freshCartProduct({ ...legacy.product, isExtendedRange: true }).isExtendedRange, true);
  assert.equal(freshCartProduct({ ...legacy.product, source: 'instore' }).isExtendedRange, true);
});

test('a historical source-unknown line stays blocked even if its identifier collides with main', () => {
  const collision = { id: 'OLD', code: 'OLD', name: 'Different main pack', price: 25, minQty: 6, unitsOfIssue: 'PACK12' };
  const recovered = recoverCartProducts([legacy], new Map([['OLD', collision]]));
  assert.equal(cartProductsNeedReview(recovered), true);
  assert.deepEqual(recovered[0].product, legacy.product);
  assert.equal(recovered[0].qty, legacy.qty);
  assert.equal(recovered[0].preference, legacy.preference);
  assert.equal(recovered[0].product.source, undefined);
  assert.equal(recovered[0].product.isExtendedRange, undefined);
});

test('contradictory explicit source hints stay unknown and preserve original product bytes', () => {
  const main = { code: 'OLD', name: 'Authoritative main pack', minQty: 6, unitsOfIssue: 'PACK12' };
  for (const hints of [{ isExtendedRange: false, source: 'instore' }, { isExtendedRange: true, source: 'main' }]) {
    const product = { ...legacy.product, ...hints };
    const before = JSON.stringify(product);
    const recovered = recoverCartProducts([{ ...legacy, product }], new Map([['OLD', main]]));
    assert.equal(cartProductsNeedReview(recovered), true);
    assert.equal(recovered[0].accountProductNeedsReview, true);
    assert.equal(JSON.stringify(recovered[0].product), before);
    assert.equal(recovered[0].qty, legacy.qty);
    assert.equal(recovered[0].preference, legacy.preference);
    assert.equal(JSON.stringify(freshCartProduct(product)), before);
    assert.equal(cartProductsNeedReview([{ ...legacy, product: freshCartProduct(product) }]), true);
  }
});

test('historical reorder never blesses missing, conflicting or mismatched source from a main SKU match', () => {
  const main = { code: 'OLD', name: 'Main pack', minQty: 6, unitsOfIssue: 'PACK12' };
  const historical = { productId: 'OLD', code: 'OLD', name: 'Historical Instore-looking item', unitPrice: 10, qty: 2 };
  assert.equal(verifiedReorderProduct(historical, main), null);
  assert.equal(verifiedReorderProduct({ ...historical, source: 'instore', isExtendedRange: false }, main), null);
  assert.equal(verifiedReorderProduct({ ...historical, source: 'instore', isExtendedRange: true }, main), null);
  assert.equal(verifiedReorderProduct({ ...historical, source: 'main' }, main), null);
  assert.deepEqual(verifiedReorderProduct({ ...historical, source: 'main' }, main, 'main'), { ...main, source: 'main', isExtendedRange: false });
  const instore = { ...main, isExtendedRange: true, source: 'instore' };
  assert.deepEqual(verifiedReorderProduct({ ...historical, source: 'instore' }, instore), instore);
  assert.equal(historical.source, undefined);
});

test('reorder requires a matching identity and rejects conflicting fresh catalogue context', () => {
  const historical = { productId: 'OLD', source: 'main', qty: 2 };
  assert.equal(verifiedReorderProduct(historical, { code: 'DIFFERENT', source: 'main' }), null);
  assert.equal(verifiedReorderProduct(historical, { code: 'OLD', source: 'instore' }, 'main'), null);
  assert.equal(verifiedReorderProduct({ ...historical, accountProductNeedsReview: true }, { code: 'OLD', source: 'main' }), null);
  assert.ok(verifiedReorderProduct(historical, { code: ' old ', source: 'main' }));
});

test('merged historical duplicates retain quantities and preferences while mixed or unknown source stays blocked', () => {
  for (const sources of [['main', 'instore'], ['instore', 'main'], ['main', undefined], [undefined, 'main'], [undefined, undefined]]) {
    const originals = sources.map((source, index) => ({ ...legacy, qty: index + 2,
      preference: index ? ' blue ' : 'Blue', product: { ...legacy.product, ...(source ? { source } : {}) } }));
    const before = JSON.stringify(originals);
    const merged = mergeBasketLines(originals);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].qty, 5);
    assert.equal(basketLineKey(merged[0]), basketLineKey(originals[0]));
    assert.equal(cartProductsNeedReview(merged), true);
    assert.equal(cartProductsNeedReview(recoverCartProducts(merged, new Map([['OLD', { code: 'OLD', source: 'main' }]]))), true);
    assert.equal(JSON.stringify(originals), before);
  }
  const known = mergeBasketLines([2, 3].map(qty => ({ ...legacy, qty, product: { ...legacy.product, source: 'main' } })));
  assert.equal(known[0].qty, 5);
  assert.equal(cartProductsNeedReview(known), false);
});

test('fresh addition cannot silently relabel a same-preference historical line', () => {
  const incoming = { ...legacy, product: freshCartProduct(legacy.product, 'main') };
  for (const hints of [{}, { source: 'instore' }, { source: 'main', isExtendedRange: true }]) {
    const historical = { ...legacy, product: { ...legacy.product, ...hints } };
    const before = JSON.stringify(historical);
    const added = addBasketLine([historical], incoming, { quantityCapForProduct: () => 20 });
    assert.equal(added.items.length, 1);
    assert.equal(added.items[0].qty, 6);
    assert.equal(added.addedQty, 3);
    assert.equal(cartProductsNeedReview(added.items), true);
    assert.equal(JSON.stringify(historical), before);
  }
});
