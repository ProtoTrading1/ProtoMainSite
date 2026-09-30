import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a submitted Instore search prioritises matching products over browse tiles', async () => {
  const page = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');

  assert.match(page, /\{!submittedQuery && tiles\.length > 0 && <section className="instore-browse"/);
  assert.match(page, /<div ref=\{resultsRef\} className="instore-results"/);
});

test('search results expose one accessible status and useful recovery actions', async () => {
  const page = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/components/InstoreProducts.css', import.meta.url), 'utf8');

  assert.match(page, /aria-live="polite" aria-atomic="true"/);
  assert.doesNotMatch(page, /className="instore-loading" role="status"/);
  assert.match(page, /> Edit search</);
  assert.match(page, /> Browse all products</);
  assert.match(page, /> Request this product</);
  assert.match(page, /searchQueryVariants\(submittedQuery\)/);
  assert.match(page, /proto:open-product-request/);
  assert.match(page, /!searchActive && <ol className="instore-guide"/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.instore--search-active \.instore-grid\{grid-template-columns:1fr/);
  assert.match(css, /@media\(max-width:360px\)[\s\S]*?\.instore-clear-results\{width:100%/);
});

test('Instore result pages stay compact enough to compare on mobile and by keyboard', async () => {
  const pager = await readFile(new URL('../lib/instore-page.mjs', import.meta.url), 'utf8');
  const api = await readFile(new URL('../api/extended-range.js', import.meta.url), 'utf8');

  assert.match(pager, /INSTORE_PAGE_SIZE = 24/);
  assert.match(api, /const PAGE_SIZE = 24/);
});

test('combined search keeps its query and announces the combined result truthfully', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/components/MainContent.jsx', import.meta.url), 'utf8');

  assert.match(app, /<ExtendedRangePage[\s\S]*initialQuery=\{instoreRouteQuery\}/);
  assert.match(app, /const route = instoreSearchRoute\(searchQuery\)/);
  assert.doesNotMatch(app, /const route = instoreSearchRoute\(searchQuery\);\s*setSearchQuery\(''\)/);
  assert.match(app, /onViewAllInstore=\{viewAllInstoreMatches\}/);
  assert.match(app, /onSearchQueryChange=\{\(nextQuery\) => \{[\s\S]*instoreSearchRefinements\(refinements, nextQuery\)/);
  assert.match(app, /initialPage=\{instoreRoutePage\}/);
  assert.match(app, /onPageChange=\{\(nextPage\) => \{[\s\S]*instorePageRefinements\(refinements, nextPage\)/);
  assert.match(app, /onMobileSearchRequest=\{viewingInstoreProducts \? focusInstoreSearch : undefined\}/);
  assert.match(main, /matching products across Proto/);
  assert.match(main, /products found in Instore/);
});

test('mobile Search focuses the existing Instore search instead of opening a second interface', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const header = await readFile(new URL('../src/components/Header.jsx', import.meta.url), 'utf8');
  const instore = await readFile(new URL('../src/components/ExtendedRangePage.jsx', import.meta.url), 'utf8');

  assert.match(app, /mobileSearchControlsId=\{viewingInstoreProducts \? 'instore-search' : undefined\}/);
  assert.match(header, /if \(onMobileSearchRequest\) \{[\s\S]*closeMobileSearch\(\);[\s\S]*onMobileSearchRequest\(\);[\s\S]*return;/);
  assert.match(header, /onClick=\{requestMobileSearch\}/);
  assert.match(instore, /const searchRef = searchInputRef \|\| internalSearchRef/);
  assert.match(instore, /ref=\{searchRef\} id="instore-search"/);
  assert.match(header, /const handleMobileInput = \(val\) => \{\s*setMobileInput\(val\);\s*setMobileActiveIdx/);
  assert.doesNotMatch(header, /const handleMobileInput = \(val\) => \{[\s\S]*?liftSearch\(val\)/);
});
