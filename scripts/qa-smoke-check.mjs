#!/usr/bin/env node
/**
 * Portal smoke checks for plumbing audit.
 * Run: node scripts/qa-smoke-check.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  enrichMotarroCategoryFields,
  inferMotarroPathFromRow,
  injectMotarroIntoTree,
  isMotarroProduct,
  parseStoredMotarroPath,
} from '../lib/mottaro-category.mjs';
import { shouldShowPopup, dismissPopup } from '../src/lib/popupSpecial.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

console.log('Portal QA smoke checks…\n');

// Item 2 — Mottaro inject matches admin
const tree = injectMotarroIntoTree([
  { id: 'arts-and-crafts', label: 'Arts and Crafts', children: [{ id: 'art-supplies', label: 'Art Supplies', children: [] }] },
  { id: 'stationery', label: 'Stationery', children: [] },
]);
assert.ok(tree.some((n) => n.id === 'mottaro'), 'Mottaro node injected');
console.log('✓ Item 2 Mottaro taxonomy inject');

const row = { title: 'MOTTARO Canvas 8x10', category: 'Arts and Crafts', subcategory_one: 'Art Supplies' };
assert.ok(isMotarroProduct(row), 'isMotarroProduct detects brand');
const product = enrichMotarroCategoryFields(
  { categoryPath: ['arts-and-crafts', 'art-supplies'] },
  row,
  tree,
  ['arts-and-crafts', 'art-supplies'],
);
assert.ok(product.categoryPaths?.length >= 2, 'categoryPaths includes Mottaro path');
assert.equal(product.categoryPaths[0][0], 'arts-and-crafts');
assert.equal(product.categoryPaths[1][0], 'mottaro');
console.log('✓ Item 2 Mottaro product paths');

const taxonomySrc = readFileSync(join(root, 'src/lib/taxonomy.js'), 'utf8');
assert.doesNotMatch(taxonomySrc, /['"]motarro['"]\s*:\s*['"]stationery['"]/, 'motarro→stationery alias removed');
console.log('✓ Item 2 legacy motarro alias removed');

// Item 3 — popup seen-flag keys on updatedAt
const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => ls.get(k) ?? null,
  setItem: (k, v) => { ls.set(k, String(v)); },
  removeItem: (k) => { ls.delete(k); },
};
const cfgA = { active: true, imageUrl: 'https://x/a.jpg', updatedAt: '2026-01-01T00:00:00Z' };
const cfgB = { active: true, imageUrl: 'https://x/b.jpg', updatedAt: '2026-01-02T00:00:00Z' };
assert.equal(shouldShowPopup({ active: false, imageUrl: 'x', updatedAt: '1' }), false, 'inactive hides');
assert.equal(shouldShowPopup(cfgA), true, 'first view shows');
dismissPopup(cfgA);
assert.equal(shouldShowPopup(cfgA), false, 'dismissed same version hidden');
assert.equal(shouldShowPopup(cfgB), true, 'new updatedAt re-shows');
console.log('✓ Item 3 popup seen-flag uses updatedAt');

// Item 4 — sort-order TTL tightened; catalogue LS key excludes sort orders
const productsSrc = readFileSync(join(root, 'src/lib/products.js'), 'utf8');
assert.match(productsSrc, /SORT_ORDERS_TTL\s*=\s*15_000/, 'sort-order TTL is 15s');
assert.doesNotMatch(productsSrc, /localStorage.*sort/i, 'sort orders not in localStorage catalogue key');
console.log('✓ Item 4 sort-order cache settings');

// Shared Mottaro module — must stay byte-identical to the admin copy
const MOTTARO_SHARED_HASH = '702c264b95de85b8';
const mottaroShared = readFileSync(join(root, 'lib/mottaro-category.mjs'), 'utf8');
assert.equal(
  createHash('sha256').update(mottaroShared).digest('hex').slice(0, 16),
  MOTTARO_SHARED_HASH,
  'lib/mottaro-category.mjs must stay byte-identical to protoportal-admin/lib/mottaro-category.mjs — edit both copies together and update the pinned hash in both qa-smoke-check.mjs files',
);
console.log('✓ Shared Mottaro module in sync with protoportal-admin');

// mottaro_path persistence — stored snapshot keeps placement when labels vanish
assert.deepEqual(
  inferMotarroPathFromRow({ title: 'MOTTARO brush', category: null, mottaro_path: '["mottaro","mottaro-art-supplies"]' }, tree),
  ['mottaro', 'mottaro-art-supplies'],
  'stored mottaro_path wins when primary labels are gone',
);
assert.deepEqual(
  inferMotarroPathFromRow({ title: 'MOTTARO thing', category: '', mottaro_path: '["bogus"]' }, tree),
  ['mottaro', 'mottaro-other', 'mottaro-other-general'],
  'invalid stored path falls back to Other›General',
);
assert.equal(parseStoredMotarroPath('["mottaro","deleted-branch"]', tree), null, 'stored path validated against current tree');
const enrichedStored = enrichMotarroCategoryFields(
  {},
  { title: 'MOTTARO pen', category: 'Stationery', mottaro_path: '["mottaro","mottaro-school-office"]' },
  tree,
  ['stationery'],
);
assert.deepEqual(enrichedStored.mottaroPath, ['mottaro', 'mottaro-school-office'], 'enrich exposes validated stored path');
console.log('✓ mottaro_path stored-snapshot read logic');

// Canonical availability rule — must match admin isPublishableOnWebsite
const productsLibSrc = readFileSync(join(root, 'src/lib/products.js'), 'utf8');
assert.match(productsLibSrc, /qty !== null && qty !== 0/, 'negative SOH counts as available (backorder lines live)');
const cardSrc = readFileSync(join(root, 'src/components/ProductCard.jsx'), 'utf8');
assert.match(cardSrc, /qty === 0\) return product\.keepLiveWhenOos/, 'badge shows out-of-stock only for exactly zero');
console.log('✓ Canonical availability rule (matches admin)');

// Stale fallback removed — last-ditch catalogue uses the regenerated file
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');
assert.match(appSrc, /fetch\('\/products\.json'\)/, 'fallback fetches regenerated products.json');
assert.doesNotMatch(appSrc, /stockProducts\.json'\)/, 'no fetch of frozen stockProducts.json');
assert.ok(!existsSync(join(root, 'public/stockProducts.json')), 'frozen stockProducts.json deleted');
console.log('✓ Stale catalogue fallback removed');

// Leaf category browse must not leak shallow products — the nav path must be a
// PREFIX of the product path (product filed at least as deep). A Math.min depth
// let a department/L1 product surface under every leaf beneath it.
assert.doesNotMatch(productsLibSrc, /const depth = Math\.min\(cp\.length, resolved\.length\)/, 'no Math.min prefix leak in category filter');
assert.match(productsLibSrc, /cp\.length >= resolved\.length && resolved\.every\(\(seg, i\) => cp\[i\] === seg\)/, 'category filter requires nav path to be a prefix of the product path');
console.log('✓ Category leaf filter is prefix-exact (no shallow-product leak)');

// Deleted Motarro subcategories are hidden from the live tree + APIs read the list
const hiddenTree = injectMotarroIntoTree([
  { id: 'arts-and-crafts', label: 'Arts and Crafts', children: [{ id: 'crafts', label: 'Crafts', children: [] }] },
  { id: 'stationery', label: 'Stationery', children: [] },
], ['mottaro-crafts']);
assert.ok(!hiddenTree.find((n) => n.id === 'mottaro').children.some((c) => c.id === 'mottaro-crafts'), 'hidden Motarro node pruned from portal tree');
for (const f of ['api/products.js', 'api/taxonomy.js']) {
  const src = readFileSync(join(root, f), 'utf8');
  assert.match(src, /taxonomy\/mottaro-hidden\.json/, `${f} reads the hidden Motarro list`);
  assert.match(src, /injectMotarroIntoTree\([^)]*hidden/, `${f} passes hidden ids into the tree`);
}
console.log('✓ Motarro deletions mirror to the storefront');

// Registration must NEVER auto-generate a customer code (allocated manually)
const registerTradeSrc = readFileSync(join(root, 'api/register-trade.js'), 'utf8');
assert.doesNotMatch(registerTradeSrc, /allocateCustomerCode\(/, 'register-trade no longer allocates a customer code');
assert.match(registerTradeSrc, /allocatedCustomerCode = null/, 'register-trade leaves the customer code null');
console.log('✓ Registration never auto-generates a customer code');

// New Arrivals contract: the storefront must honour the admin's is_new_arrival flag
const productsApiSrc = readFileSync(join(root, 'api/products.js'), 'utf8');
assert.match(productsApiSrc, /'is_new_arrival'/, 'products API selects is_new_arrival from stock');
assert.match(productsApiSrc, /isNew: !!row\.is_new_arrival/, 'products API maps is_new_arrival to isNew (New Stock collection reflects admin)');
console.log('✓ New Arrivals honours the admin is_new_arrival flag');

// Email revamp — Email 1 (reset) points at site.proto.co.za; Email 2 wording;
// Email 5 (customer order acknowledgement) sent on order placement.
const resetSrc = readFileSync(join(root, 'api/send-reset-email.js'), 'utf8');
assert.match(resetSrc, /SITE_URL \|\| 'https:\/\/site\.proto\.co\.za'/, 'reset link defaults to site.proto.co.za');
assert.doesNotMatch(resetSrc, /protoportal-main\.vercel\.app/, 'reset email no longer references the old vercel host');
const registerSrc = readFileSync(join(root, 'api/register-trade.js'), 'utf8');
assert.match(registerSrc, /approve your request within 24 hours/, 'application-received email states the 24-hour window');
const sendOrderSrc = readFileSync(join(root, 'api/send-order.js'), 'utf8');
assert.match(sendOrderSrc, /async function sendCustomerOrderAck/, 'order flow acknowledges the customer');
assert.match(sendOrderSrc, /We have received your order/, 'customer order ack says we received your order');
assert.match(sendOrderSrc, /await sendCustomerOrderAck\(\{ customer, itemCount: items\.length \}\)/, 'order handler sends the customer acknowledgement');
console.log('✓ Email revamp (portal): reset URL, received wording, order acknowledgement');

console.log('\nAll portal smoke checks passed.');
