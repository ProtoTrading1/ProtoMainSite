import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesInstoreSearch } from '../lib/instore-discovery.mjs';
import { instorePage } from '../lib/instore-page.mjs';
import { SARONGI_GALLERIES } from '../lib/sarongi-instore-gallery-data.mjs';
import { instoreOptionSearchText } from '../lib/instore-option-search.mjs';

const product = {
  sku: 'KBRA3014', title: 'BRACELET DRAWSTRING 4PC', originalDescription: 'BRACELET DRAWSTRING 4PC',
  image: `https://www.proto.co.za${SARONGI_GALLERIES.KBRA3014[0].path}`,
  isExtendedRange: true, imageStatus: 'visible', price: 27.5, stockQty: 9, minQty: 1,
};

test('old cached listings match reviewed option colours, exact codes and description words', () => {
  const before = JSON.stringify(product);
  for (const query of ['purple drawstring bracelet', 'orange drawstring bracelet', 'turquoise bracelet', 'KBRA3014', 'bracelet drawstring']) {
    assert.equal(matchesInstoreSearch(product, query), true, query);
    assert.equal(instorePage([product], { query }).products[0]?.sku, product.sku, query);
  }
  for (const query of ['red drawstring bracelet', 'white drawstring bracelet', 'purple necklace', 'KBRA3015', 'sarongi', 'sarongi bracelet']) {
    assert.equal(matchesInstoreSearch(product, query), false, query);
  }
  assert.equal(JSON.stringify(product), before, 'no wording, stock, price, units or image mutation');
});

test('all reviewed gallery labels are searchable without indexing supplier paths', () => {
  for (const [sku, photos] of Object.entries(SARONGI_GALLERIES)) {
    const item = { ...product, sku, title: 'JEWELLERY', originalDescription: 'JEWELLERY', image: `https://www.proto.co.za${photos[0].path}` };
    for (const photo of photos) assert.equal(matchesInstoreSearch(item, photo.label), true, `${sku}: ${photo.label}`);
    assert.equal(matchesInstoreSearch(item, 'sarongi'), false, sku);
  }
});

test('hidden, foreign, replaced and unrelated images cannot add old option keywords', () => {
  for (const changes of [
    { imageStatus: 'hidden' }, { isExtendedRange: false }, { sku: 'OTHER' },
    { image: product.image.replace('www.proto.co.za', 'example.com') },
    { image: 'https://www.proto.co.za/replaced.jpg' }, { image: `${product.image}?revision=2` },
  ]) {
    const item = { ...product, ...changes };
    assert.equal(instoreOptionSearchText(item), '', JSON.stringify(changes));
    assert.equal(matchesInstoreSearch(item, 'purple drawstring bracelet'), false);
  }
});
