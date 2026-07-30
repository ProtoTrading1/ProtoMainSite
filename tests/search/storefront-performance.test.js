import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');
const productsLibSrc = readFileSync(join(root, 'src/lib/products.js'), 'utf8');
const productsApiSrc = readFileSync(join(root, 'api/products.js'), 'utf8');
const headerSrc = readFileSync(join(root, 'src/components/Header.jsx'), 'utf8');
const productCardSrc = readFileSync(join(root, 'src/components/ProductCard.jsx'), 'utf8');

test('category counts are independent from browse, page, search and sort changes', () => {
  assert.match(
    appSrc,
    /fetchCategoryCounts\(\{ collection: activeCollection, inStockOnly \}\)[\s\S]*?\}, \[activeCollection, categories, inStockOnly, catalogRefreshKey\]\);/,
    'counts refresh only when catalogue scope or taxonomy changes',
  );
  assert.equal(
    (appSrc.match(/fetchCategoryCounts\(/g) || []).length,
    1,
    'the product-page loading effect does not repeat the category count pass',
  );
  assert.match(productsLibSrc, /_categoryCountsMemo = new WeakMap\(\)/, 'count results are memoized by catalogue and taxonomy');
});

test('exact identifier lookup is coalesced and uses an exact-first server query', () => {
  assert.match(productsLibSrc, /const _identifierRequests = new Map\(\)/, 'client has an in-flight identifier request map');
  assert.match(headerSrc, /fetchIdentifierProducts\(query\)/, 'desktop suggestions share the catalogue identifier request');
  assert.match(headerSrc, /fetchIdentifierProducts\(val\)/, 'mobile suggestions share the catalogue identifier request');
  assert.match(productsApiSrc, /async function fetchIdentifierRows/, 'server has a dedicated identifier path');
  assert.match(
    productsApiSrc,
    /if \(exact\.length\) return exact;[\s\S]*applyIdentifierFilter\(q, identifier\)/,
    'prefix matching is only used when exact SKU/barcode matching is empty',
  );
});

test('product detail begins a live stock lookup without querying every grid card', () => {
  assert.match(productCardSrc, /function StockCheck\(\{ sku, autoCheck = false \}\)/);
  assert.match(productCardSrc, /if \(autoCheck\) void check\(\)/);
  assert.match(productCardSrc, /<StockCheck[\s\S]*?autoCheck[\s\S]*?\/>/);
  assert.match(productCardSrc, /<StockCheck sku=\{sku\} \/>/, 'grid stock remains explicitly requested');
});
