import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShoppingEvent, internalShoppingUser, shoppingEnvironment } from '../api/_shopping-event.js';
import { basketQuantityChanges, trackCatalogueVisit, trackShoppingSearch, trackShoppingProduct, shoppingProductSearch, clearShoppingSearch } from '../src/lib/shoppingAnalytics.js';
const base = { eventId: 'f2761d6e-01fb-4c67-b6e9-b418c829035f', sessionId: 'ed130931-a3f5-4207-bd1f-25989291ce03', eventType: 'catalogue_viewed', source: 'main' };
test('accepts source counts and strips client identity, environment, money and unsafe metadata', () => {
 const row = normalizeShoppingEvent({ ...base, eventType: 'search_results_viewed', searchTerm: 'clip on', resultsCount: 4, mainResultsCount: 1, instoreResultsCount: 3, customerId: 'fake', environment: 'production', orderValue: 123, metadata: { email: 'secret@example.com', department: 'craft', reason: 'test', notes: 'private' } });
 assert.equal(row.results_count, 4); assert.deepEqual(row.metadata, { department: 'craft', reason: 'test' });
 assert.equal(row.customer_id, undefined); assert.equal(row.environment, undefined); assert.equal(row.order_value, undefined);
});
test('rejects unknown events, UUIDs, invalid counts and insufficient product/search/tip evidence', () => {
 for (const fields of [{ eventType: 'bad' }, { sessionId: 'fake' }, { resultsCount: -1 }, { position: Infinity }, { source: 'bad' }, { searchTerm: 'a'.repeat(201) }, { eventType: 'product_viewed' }, { eventType: 'search_results_viewed' }, { eventType: 'search_tip_shown' }]) assert.throws(() => normalizeShoppingEvent({ ...base, ...fields }));
});
test('internal and environment classifications use verified facts rather than user metadata or request spoofing', () => {
 assert.equal(internalShoppingUser({ user: { id: 'a', user_metadata: { role: 'admin' } }, customer: {} }, ''), false);
 assert.equal(internalShoppingUser({ user: { id: 'a', app_metadata: { role: 'staff' } }, customer: {} }, ''), true);
 assert.equal(internalShoppingUser({ user: { id: 'a' }, customer: {} }, 'b,a'), true);
 assert.equal(shoppingEnvironment({ headers: { host: 'www.proto.co.za' } }, { VERCEL_ENV: 'preview' }), 'preview');
});
test('basket diffs count actual changes, aggregate preference lines, and ignore unchanged stock-capped attempts', () => {
 const product = { id: 'paint', code: 'P1', isExtendedRange: true };
 assert.deepEqual(basketQuantityChanges([{ product, qty: 2 }], [{ product, qty: 2 }]), []);
 const adds = basketQuantityChanges([{ product, qty: 2 }], [{ product, qty: 2, preference: 'red' }, { product, qty: 3, preference: 'blue' }]);
 assert.equal(adds[0].quantity, 3); assert.equal(adds[0].eventType, 'basket_item_added');
 assert.equal(basketQuantityChanges([{ product, qty: 5 }], [])[0].eventType, 'basket_item_removed');
 assert.equal(basketQuantityChanges([{ product, qty: 5 }], [{ product, qty: 2 }])[0].quantity, 3);
});

test('arrival telemetry requires verified product/source shape and arrival stage', () => {
 assert.equal(normalizeShoppingEvent({ ...base, eventType: 'personalised_tip_shown', tipStage: 'arrival', productId: 'SKU-1' }).tip_stage, 'arrival');
 assert.throws(() => normalizeShoppingEvent({ ...base, eventType: 'personalised_tip_clicked', tipStage: 'initial', productId: 'SKU-1' }));
 assert.throws(() => normalizeShoppingEvent({ ...base, eventType: 'personalised_tip_dismissed', tipStage: 'arrival' }));
});

test('initial catalogue visit persists once per authenticated customer, source and tab session', () => {
 const prior = globalThis.sessionStorage; const storage = new Map();
 globalThis.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
 trackCatalogueVisit('customer-1', 'main'); trackCatalogueVisit('customer-1', 'main');
 assert.equal([...storage.keys()].filter(key => key.startsWith('proto_analytics_catalogue_visit')).length, 1);
 trackCatalogueVisit('customer-1', 'instore'); trackCatalogueVisit('customer-2', 'main');
 assert.equal([...storage.keys()].filter(key => key.startsWith('proto_analytics_catalogue_visit')).length, 3);
 globalThis.sessionStorage = prior;
});

test('all verified internal roles are excluded while forged profile roles remain customer traffic', () => {
 for (const role of ['admin', 'staff', 'owner', 'super_admin', 'superadmin', 'employee']) {
  assert.equal(internalShoppingUser({ user: { id: 'a' }, customer: { role } }, ''), true);
  assert.equal(internalShoppingUser({ user: { id: 'a', app_metadata: { role } }, customer: {} }, ''), true);
  assert.equal(internalShoppingUser({ user: { id: 'a', user_metadata: { role } }, customer: { role: 'customer' } }, ''), false);
 }
});

test('deployed admin allowlist uses authenticated email and never profile email', () => {
 for (const email of ['danieljoffeinfo@gmail.com', 'george@proto.co.za', 'online@proto.co.za']) {
  assert.equal(internalShoppingUser({ user: { id: 'a', email }, customer: { role: 'customer' } }, ''), true);
  assert.equal(internalShoppingUser({ user: { id: 'a', email: 'customer@example.invalid', user_metadata: { email } }, customer: { email } }, ''), false);
 }
});

test('main mixed-search Instore product lineage survives view and basket but clears on new queries', () => {
 clearShoppingSearch('main'); clearShoppingSearch('instore');
 const product = { code: 'CLIP-ON', id: 'CLIP-ON', isExtendedRange: true };
 const main = trackShoppingSearch({ source: 'main', searchTerm: 'clip on', resultsCount: 1 });
 const instore = trackShoppingSearch({ source: 'instore', searchTerm: 'other', resultsCount: 1 });
 trackShoppingProduct('search_result_clicked', product, { searchId: main, searchSource: 'main' });
 assert.equal(shoppingProductSearch(product), main);
 trackShoppingProduct('product_viewed', product); trackShoppingProduct('basket_item_added', product, { quantity: 1 });
 assert.equal(shoppingProductSearch(product), main);
 clearShoppingSearch('main'); assert.equal(shoppingProductSearch(product), instore);
 clearShoppingSearch('instore'); assert.equal(shoppingProductSearch(product), null);
 const fresh = trackShoppingSearch({ source: 'main', searchTerm: 'new query', resultsCount: 1 });
 assert.notEqual(fresh, main); assert.equal(shoppingProductSearch(product), null);
 trackShoppingProduct('search_result_clicked', product, { searchId: fresh, searchSource: 'main' });
 assert.equal(shoppingProductSearch(product), fresh);
 clearShoppingSearch('main'); clearShoppingSearch('instore');
});

test('real Instore department punctuation is preserved while malformed metadata is excluded', () => {
 for (const department of ['Stationery & art', 'Beads & jewellery making', 'Crafts & DIY']) {
  assert.equal(normalizeShoppingEvent({ ...base, eventType: 'department_viewed', source: 'instore', metadata: { department } }).metadata.department, department);
 }
 for (const department of ['x'.repeat(161), 'stationery\nart', 'bad' + String.fromCharCode(127), 42, null]) {
  assert.deepEqual(normalizeShoppingEvent({ ...base, metadata: { department, email: 'private@example.invalid', notes: 'discard' } }).metadata, {});
 }
});
