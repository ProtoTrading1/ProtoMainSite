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
  const card = await readSource('src/components/ProductCard.jsx');
  const cardCss = await readSource('src/components/ProductCard.css');
  const siteCss = await readSource('src/index.css');
  assert.match(card, /className=\{`pc-orderability pc-orderability--\$\{badgeClass\}`\}/);
  assert.match(card, /<StockCheck sku=\{sku\} \/>/, 'live grid stock remains customer initiated');
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

test('exact product links authenticate their focused lookup', async () => {
  const products = await readSource('src/lib/products.js');
  assert.match(products, /skus=\$\{encodeURIComponent\(batch\.join\(','\)\)\}[\s\S]{0,180}authenticated: true/);
});
