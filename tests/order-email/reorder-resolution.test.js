import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');
const productsLibSrc = readFileSync(join(root, 'src/lib/products.js'), 'utf8');
const productsApiSrc = readFileSync(join(root, 'api/products.js'), 'utf8');

// Reorder resolved products against `catalogProducts` — a single 60-product
// page, narrowed further by the active category/search/in-stock filter. A
// 160-line reorder therefore added only what happened to be on screen and
// dropped the rest silently via .filter(Boolean).

test('reorder resolves products through the API, not the current catalogue page', () => {
  assert.match(appSrc, /const handleReorder = async \(items\)/, 'reorder is async so it can look products up');
  assert.match(appSrc, /fetchProductsBySkus\(items\.map/, 'reorder resolves every requested sku');
  assert.doesNotMatch(
    appSrc,
    /const selectedItems = items\s*\n?\s*\.map\(\(item\) => \{\s*\n?\s*const product = catalogProducts\.find/,
    'reorder no longer matches only against the loaded page',
  );
});

test('reorder reports what it could not add instead of dropping it', () => {
  assert.match(appSrc, /missing\.push\(item\)/, 'unresolved lines are collected');
  assert.match(appSrc, /return \{ added, missing, overflow \}/, 'the caller is told what happened');
  assert.match(appSrc, /if \(!missing\.length && !overflow\) setReorderModal\(false\)/, 'the modal stays open when something failed');
});

test('the cart cannot be pushed past the server line limit', () => {
  assert.match(appSrc, /const MAX_CART_LINES = 250/, 'client mirrors MAX_ORDER_LINES');
  assert.match(appSrc, /if \(nextCart\.length >= MAX_CART_LINES\) \{ overflow \+= 1; continue; \}/, 'overflow is counted, not silently added');
});

test('sku lookup batches, tolerates a failed batch, and is bounded server-side', () => {
  assert.match(productsLibSrc, /export async function fetchProductsBySkus/, 'helper exists');
  assert.match(productsLibSrc, /Promise\.allSettled/, 'one failed batch does not lose the others');
  assert.match(productsApiSrc, /MAX_SKUS_PER_REQUEST = 200/, 'server bounds the IN(...) list');
  assert.match(productsApiSrc, /\.slice\(0, MAX_SKUS_PER_REQUEST\)/, 'the bound is applied');
});
