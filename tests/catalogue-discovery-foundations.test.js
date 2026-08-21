import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildProductDetailUrl,
  readProductDetailFromHash,
  withProductDetailHash,
  withoutProductDetailHash,
} from '../src/lib/productDetailUrl.js';
import { shouldPrefetchData } from '../src/lib/imageUrl.js';

const readSource = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('public departments are presented as an access preview rather than fake controls', async () => {
  const section = await readSource('src/components/landing/LandingDepartmentsSection.jsx');
  assert.match(section, /<ul className="lp-dept-tags"/);
  assert.doesNotMatch(section, /<button[^>]+lp-dept-tag/);
  assert.match(section, /after your online trade account is approved/);
  assert.match(section, /href="#lp-apply"/);
});

test('catalogue search explains all supported product identifiers', async () => {
  const header = await readSource('src/components/Header.jsx');
  assert.match(header, /Search by product name, SKU or barcode\./);
  assert.equal((header.match(/Product name, SKU or barcode…/g) || []).length, 2);
});

test('unavailable products remain discoverable and are visually disabled', async () => {
  const [app, content, card, cardCss] = await Promise.all([
    readSource('src/App.jsx'),
    readSource('src/components/MainContent.jsx'),
    readSource('src/components/ProductCard.jsx'),
    readSource('src/components/ProductCard.css'),
  ]);
  assert.match(app, /sessionStorage\.removeItem\(IN_STOCK_ONLY_KEY\)/);
  assert.doesNotMatch(content, /Available only|<strong>Orderable<\/strong>/);
  assert.match(card, /product-card--unavailable/);
  assert.match(cardCss, /\.product-card\.product-card--unavailable/);
  assert.match(cardCss, /filter: grayscale\(0\.72\)/);
});

test('orderability and customer-initiated live stock remain visible on mobile', async () => {
  const [app, card, cardCss, siteCss] = await Promise.all([
    readSource('src/App.jsx'),
    readSource('src/components/ProductCard.jsx'),
    readSource('src/components/ProductCard.css'),
    readSource('src/index.css'),
  ]);
  assert.match(card, /className=\{`pc-orderability pc-orderability--\$\{badgeClass\}`\}/);
  assert.match(card, /label: 'Stock varies by option'/, 'variant groups use a neutral group-level stock message');
  assert.match(card, /!product\.isVariantGroup && sku \? <StockCheck sku=\{sku\} \/>/, 'single-SKU live grid stock remains customer initiated');
  assert.match(card, /<PackageSearch size=\{16\} \/>[\s\S]*Choose option/, 'variant groups expose one clear primary action');
  assert.doesNotMatch(card, /Select option for live stock|View options/, 'duplicate option actions are removed');
  assert.match(card, /isVariantGroup \? \([\s\S]*Choose option[\s\S]*\) : \([\s\S]*aria-label="Quantity"/, 'group quantity controls wait until an exact option is chosen');
  assert.match(card, /Choose an option above to check live stock and continue/, 'the option modal explains the next step');
  assert.match(card, /isVariantGroup && !selectedVariant \? \([\s\S]*pz-options-prompt[\s\S]*\) : \([\s\S]*pz-qty-row/, 'modal quantity and ordering wait for an explicit variant choice');
  assert.doesNotMatch(card, /initialZoomOpen && isVariantGroup/, 'the first option is never silently selected for the customer');
  assert.match(card, /optionAvailability\.label/, 'each option exposes its own catalogue availability before the live check');
  assert.match(card, /variants\?\.scrollIntoView/, 'the mobile preview scrolls the exact choices into view');
  assert.match(app, /initialFocusOptions=\{previewOptionsFirst\}/, 'the global product preview preserves the stock-action intent');
  assert.match(siteCss, /\.product-card \.stock-check\s*\{[\s\S]*?min-height: 44px;/);
  assert.match(siteCss, /\.product-card \.check-stock-btn\s*\{[\s\S]*?width: 100%;/);
  assert.doesNotMatch(siteCss, /\.product-card \.stock-check,[\s\S]{0,160}?display: none !important;/);
  assert.match(cardCss, /@media \(max-width: 768px\)[\s\S]*?\.product-card \.pc-orderability/);
  assert.match(card, /Minimum \$\{minimum\}/);
});

test('optional prefetching respects Save-Data and slow connections', () => {
  assert.equal(shouldPrefetchData({ saveData: true, effectiveType: '4g' }), false);
  assert.equal(shouldPrefetchData({ saveData: false, effectiveType: 'slow-2g' }), false);
  assert.equal(shouldPrefetchData({ saveData: false, effectiveType: '2g' }), false);
  assert.equal(shouldPrefetchData({ saveData: false, effectiveType: '3g' }), true);
  assert.equal(shouldPrefetchData(undefined), true);
});

test('product detail URLs preserve browse refinements and round-trip safely', () => {
  const hash = withProductDetailHash('#/beads?colour=Red', { sku: '86 123/4' });
  assert.equal(hash, '#/beads?colour=Red&product=86+123%2F4');
  assert.equal(readProductDetailFromHash(hash), '86 123/4');
  assert.equal(withoutProductDetailHash(hash), '#/beads?colour=Red');
  assert.equal(
    buildProductDetailUrl({ websiteSku: 'ABC-1' }, 'https://proto.co.za/#/packaging?style=Gift'),
    'https://proto.co.za/#/packaging?style=Gift&product=ABC-1',
  );
});

test('all catalogue product previews use the stable detail URL and offer sharing', async () => {
  const [app, content, card] = await Promise.all([
    readSource('src/App.jsx'),
    readSource('src/components/MainContent.jsx'),
    readSource('src/components/ProductCard.jsx'),
  ]);
  assert.match(app, /productDetailKey/);
  assert.match(app, /fetchProductsBySkus\(\[productDetailKey\]\)/);
  assert.match(app, /products\.get\(productDetailKey\.toUpperCase\(\)\)/);
  assert.match(app, /product: id/);
  assert.match(app, /delete next\.product/);
  assert.match(app, /replace: true/);
  assert.equal((content.match(/onProductPreview=\{onProductPreview\}/g) || []).length >= 2, true);
  assert.match(card, /buildProductDetailUrl\(activeProduct\)/);
  assert.match(card, /Share product/);
});

test('product previews preserve browse position and keep option tags above images', async () => {
  const [card, root, siteCss] = await Promise.all([
    readSource('src/components/ProductCard.jsx'),
    readSource('src/Root.jsx'),
    readSource('src/index.css'),
  ]);

  assert.match(card, /const savedScroll = \{/);
  assert.match(card, /contentTop: contentArea\?\.scrollTop/);
  assert.match(card, /lastFocusedElementRef\.current\.focus\(\{ preventScroll: true \}\)/);
  assert.match(card, /restoreBrowsePosition\(\);[\s\S]*requestAnimationFrame\(restoreBrowsePosition\)/,
    'scroll is restored immediately and again after Safari finishes body unlock');
  assert.match(root, /const onPopState = \(\) => \{[\s\S]*shouldRootScrollOnHash\(window\.location\.hash\)[\s\S]*scrollToTop\(\)/,
    'product URL state must not trigger the root-level route scroll reset');
  assert.match(siteCss, /\.tag-row\s*\{[\s\S]*?z-index: 3;/);
  assert.match(siteCss, /\.pz-tags\s*\{[\s\S]*?z-index: 3;/);
});

test('exact product links authenticate their focused lookup', async () => {
  const products = await readSource('src/lib/products.js');
  assert.match(products, /skus=\$\{encodeURIComponent\(batch\.join\(','\)\)\}[\s\S]{0,180}authenticated: true/);
});
