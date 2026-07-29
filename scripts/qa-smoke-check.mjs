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

// Shared placements module — must stay byte-identical to the admin copy
const PLACEMENTS_SHARED_HASH = 'a73d1bb627f01442';
const placementsShared = readFileSync(join(root, 'lib/placements.mjs'), 'utf8');
assert.equal(
  createHash('sha256').update(placementsShared).digest('hex').slice(0, 16),
  PLACEMENTS_SHARED_HASH,
  'lib/placements.mjs must stay byte-identical to protoportal-admin/lib/placements.mjs — edit both copies together and update the pinned hash in both qa-smoke-check.mjs files',
);
console.log('✓ Shared placements module in sync with protoportal-admin');

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

// Canonical availability rule — negative SOH stays available (backorder lines).
const productsLibSrc = readFileSync(join(root, 'src/lib/products.js'), 'utf8');
assert.match(productsLibSrc, /qty !== null && qty !== 0/, 'negative SOH counts as available (backorder lines live)');
const cardSrc = readFileSync(join(root, 'src/components/ProductCard.jsx'), 'utf8');
assert.match(cardSrc, /qty === 0\) return product\.toOrder \? 'toorder' : 'out'/, 'zero-stock badge is out-of-stock unless marked to order');
console.log('✓ Canonical availability rule (matches admin)');

// "To order": zero-stock products are orderable ONLY when explicitly marked
// to_order (distinct from keep_live_when_oos, which only keeps them visible).
assert.match(productsLibSrc, /isOrderableWhenOutOfStock[\s\S]*?product\.toOrder === true/, 'orderable-when-OOS keys off to_order, not keep_live');
assert.doesNotMatch(
  productsLibSrc.slice(productsLibSrc.indexOf('function isOrderableWhenOutOfStock'), productsLibSrc.indexOf('function isOrderableWhenOutOfStock') + 400),
  /keepLiveWhenOos/,
  'orderability no longer depends on keep_live_when_oos',
);
const apiProductsSrc = readFileSync(join(root, 'api/products.js'), 'utf8');
assert.match(apiProductsSrc, /toOrder: !!row\.to_order/, 'products API exposes toOrder');
assert.match(apiProductsSrc, /orderableWhenOutOfStock: !!row\.to_order/, 'products API ties orderability to to_order');
assert.match(cardSrc, /Available to order/, 'card shows an "Available to order" state/disclaimer for to_order products');
console.log('✓ To-order: zero-stock orderability is opt-in (to_order)');

// Static catalogue snapshots are GONE (487d5b6): a file under public/ is served
// unauthenticated, so shipping the trade catalogue that way exposed wholesale
// pricing to anyone with the URL. The catalogue must come from the authenticated
// API only — no client-side fallback to a static file.
const appSrc = readFileSync(join(root, 'src/App.jsx'), 'utf8');
assert.doesNotMatch(appSrc, /fetch\('\/products\.json'\)/, 'no fetch of the public products.json snapshot');
assert.doesNotMatch(appSrc, /stockProducts\.json'\)/, 'no fetch of frozen stockProducts.json');
assert.ok(!existsSync(join(root, 'public/products.json')), 'public products.json snapshot deleted');
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
assert.match(productsApiSrc, /isNew: !!row\.is_new_arrival/, 'products API maps is_new_arrival to isNew');
console.log('✓ New Arrivals honours the admin is_new_arrival flag');

// "This Week's Specials" = union of the admin flag (isNew) AND the Specials
// panel (specialsMap ids). Flagged products also get a synthesized ribbon, and
// the standalone "New Stock" collection was retired.
const productsLibSpecials = readFileSync(join(root, 'src/lib/products.js'), 'utf8');
assert.match(productsLibSpecials, /collection === 'specials'[\s\S]*?p\.isNew \|\|[\s\S]*?specialIds/, 'specials collection unions the isNew flag with specialsMap ids');
assert.doesNotMatch(productsLibSpecials, /collection === 'new'/, 'standalone New Stock collection retired from applyCollection');
const mainContentSrc = readFileSync(join(root, 'src/components/MainContent.jsx'), 'utf8');
assert.match(mainContentSrc, /product\.isNew \? \{ deal: 'none' \}/, 'flagged products get a synthesized This Week\'s Special ribbon');
assert.doesNotMatch(mainContentSrc, /id: 'new'/, 'New Stock shortcut removed from the nav');
console.log('✓ Specials = admin flag ∪ Specials panel; New Stock retired');

// Unlimited category depth: subcategory_extra (admin's overflow column for
// taxonomy depth beyond subcategory_four) must be read + folded into
// subLabels everywhere the storefront adapts a stock row, or deep
// subcategories save fine in admin but never show up here.
for (const f of ['api/products.js', 'scripts/generate-catalog.js']) {
  const src = readFileSync(join(root, f), 'utf8');
  assert.match(src, /subcategory_extra/, `${f} references subcategory_extra`);
  assert.match(src, /subcategory_four,\s*\n?\s*\.\.\.\w*[Ee]xtra/, `${f} folds parsed subcategory_extra into subLabels after subcategory_four`);
}
console.log('✓ Unlimited category depth (subcategory_extra) reaches the storefront');

// Email revamp — every clickable link in outgoing mail resolves through
// _public-site-url.js so the whole estate repoints with one env var; Email 2
// wording; Email 5 (customer order acknowledgement) sent on order placement.
const publicUrlSrc = readFileSync(join(root, 'api/_public-site-url.js'), 'utf8');
assert.match(publicUrlSrc, /SITE_URL \|\| 'https:\/\/proto\.co\.za'/, 'email links default to proto.co.za');
const resetSrc = readFileSync(join(root, 'api/send-reset-email.js'), 'utf8');
assert.match(resetSrc, /PUBLIC_SITE_URL/, 'reset link is built from PUBLIC_SITE_URL');
assert.doesNotMatch(resetSrc, /protoportal-main\.vercel\.app/, 'reset email no longer references the old vercel host');
const notifySrc = readFileSync(join(root, 'api/_order-notify-core.js'), 'utf8');
assert.doesNotMatch(notifySrc, /'https:\/\/protoportal-main\.vercel\.app'/, 'order-notify PDF links no longer default to the old vercel host');
const registerSrc = readFileSync(join(root, 'api/register-trade.js'), 'utf8');
assert.match(registerSrc, /approve your request within 24 hours/, 'application-received email states the 24-hour window');
const sendOrderSrc = readFileSync(join(root, 'api/send-order.js'), 'utf8');
assert.match(sendOrderSrc, /async function sendCustomerOrderAck/, 'order flow acknowledges the customer');
assert.match(sendOrderSrc, /We have received your order/, 'customer order ack says we received your order');
// Match the property, not the exact argument list — the call has grown extra
// fields (order number, totals, promo) and a literal-string assertion breaks on
// every legitimate edit while proving nothing about the security rule.
assert.match(sendOrderSrc, /sendCustomerOrderAck\(\{[^}]*toEmail: user\?\.email/, 'order handler sends the ack to the AUTHENTICATED account email');
assert.match(sendOrderSrc, /const to = cleanText\(toEmail\)/, 'ack recipient is the verified email, never the client-supplied customer.email');
assert.match(sendOrderSrc, /signal: AbortSignal\.timeout\(5000\)/, 'ack email is time-bounded so it cannot stall the order response');
console.log('✓ Email revamp (portal): reset URL, received wording, order acknowledgement (verified recipient + bounded)');

// Email confirmation is REMOVED — accounts are created already-confirmed and
// gated by admin approval instead. A regression here silently locks every new
// signup out behind a verification mail nobody sends.
assert.match(registerSrc, /email_confirm: true/, 'signup creates the account already confirmed');
assert.doesNotMatch(registerSrc, /generateLink|sendVerificationEmail|buildVerificationHtml/, 'no email-confirmation round-trip remains in signup');

// Every order notification must reach the whole team; config may add but never
// drop a required address.
const orderRecipientsSrc = readFileSync(join(root, 'api/_order-email-recipients.js'), 'utf8');
for (const addr of ['online@proto.co.za', 'george@proto.co.za', 'danieljoffeinfo@gmail.com']) {
  assert.match(orderRecipientsSrc, new RegExp(addr.replace('.', '\\.')), `order notifications include ${addr}`);
}
assert.match(orderRecipientsSrc, /DEFAULT_NOTIFY_EMAILS,\s*\.\.\.extra/, 'ORDER_NOTIFY_EMAILS adds to the defaults instead of replacing them');

// Unapproved logins must read as "still reviewing", never as an email-confirmation error.
// LoginModal is the LIVE login surface (Root renders it; the old
// pages/LoginPage.jsx was unreferenced and is deleted) — assert against it, or
// the wording fix lands in a file nobody sees.
const loginSrc = readFileSync(join(root, 'src/components/LoginModal.jsx'), 'utf8');
assert.match(loginSrc, /Proto is still reviewing your application/, 'login maps pending accounts to the review message');
assert.doesNotMatch(loginSrc, /Check your email to confirm/, 'login surface never tells the customer to confirm their email');
// No client-side account creation: it would bypass the trade application and
// trigger Supabase's own confirmation mail.
const authLibSrc = readFileSync(join(root, 'src/lib/auth.js'), 'utf8');
assert.doesNotMatch(authLibSrc, /supabase\.auth\.signUp/, 'no raw client-side supabase signUp');
const rootSrc = readFileSync(join(root, 'src/Root.jsx'), 'utf8');
assert.match(rootSrc, /Proto is still reviewing your application/, 'pending-approval gate uses the review message');
console.log('✓ Signup: no email confirmation, pending-review wording, full order recipient list');

// Phase two — checkout clarity, search debounce, delivery modal, category skeleton
const checkoutModalSrc = readFileSync(join(root, 'src/components/CheckoutModal.jsx'), 'utf8');
assert.match(checkoutModalSrc, /checkout-modal-btn--confirm[^]*Yes, submit/, 'submit dialog has a green Yes, submit button');
assert.match(checkoutModalSrc, /checkout-modal-btn--danger[^]*No, keep shopping/, 'submit dialog has a red No, keep shopping button');
const indexCssSrc = readFileSync(join(root, 'src/index.css'), 'utf8');
assert.match(indexCssSrc, /\.checkout-modal-btn--confirm\s*\{[^}]*#16a34a/, 'confirm button is green');
assert.match(indexCssSrc, /\.checkout-modal-btn--danger\s*\{[^}]*#dc2626/, 'keep-shopping button is red');
const headerSrc = readFileSync(join(root, 'src/components/Header.jsx'), 'utf8');
assert.match(headerSrc, /const \[inputValue, setInputValue\] = useState\(searchQuery\)/, 'desktop search input is local state (no per-keystroke App re-render)');
// The debounce interval is a tuning knob, not a contract — assert that the
// typed value reaches the parent on a timer at all, not the exact milliseconds.
assert.match(headerSrc, /setTimeout\(\(\) => setSearchQuery\(val\), \d+\)/, 'typed value is pushed to the parent on a debounce');
assert.match(headerSrc, /value=\{inputValue\}/, 'the desktop input renders the local value');
assert.doesNotMatch(headerSrc, /value=\{searchQuery\}\n\s*onFocus=\{focusSearch\}/, 'desktop input no longer bound directly to the committed searchQuery');
const drawerSrc = readFileSync(join(root, 'src/components/Drawer.jsx'), 'utf8');
assert.match(drawerSrc, /setShowCourierPicker\(true\)/, 'Continue to delivery opens the delivery picker');
assert.match(drawerSrc, /showCourierPicker && createPortal\(/, 'delivery picker renders as a portalled modal so it always appears');
assert.match(drawerSrc, /className="courier-modal-backdrop"/, 'delivery modal uses the responsive backdrop class');
assert.match(indexCssSrc, /\.courier-modal-backdrop\s*\{[^}]*position: fixed/, 'delivery modal covers the viewport (not scoped to the cart panel)');
assert.match(indexCssSrc, /@media \(max-width: 640px\)[^]*courier-modal-sheet[^]*border-radius: 16px 16px 0 0/, 'delivery modal is a bottom-sheet on mobile');
const catNavSrc = readFileSync(join(root, 'src/components/CategoryNav.jsx'), 'utf8');
assert.match(catNavSrc, /const countsReady = Boolean\(counts\) && !\(/, 'category nav treats the placeholder counts as not-ready');
assert.match(catNavSrc, /cat-nav-skeleton/, 'category nav renders a skeleton while counts load');
assert.match(indexCssSrc, /@keyframes cat-nav-shimmer/, 'category skeleton has a shimmer animation');
// Review hardening
assert.match(headerSrc, /clearTimeout\(liftRef\.current\);\s*\n\s*pendingSearchRef\.current = searchQuery;\s*\n\s*setInputValue\(searchQuery\)/, 'external search clears cancel a pending debounced lift (no ghost search)');
assert.match(catNavSrc, /Object\.keys\(counts\)\.length === 1 && Number\(counts\[''\]\) === 0/, 'skeleton only shows for the initial placeholder — never sticks in API-fallback mode');
assert.match(drawerSrc, /document\.body\.style\.overflow = 'hidden'/, 'delivery modal locks body scroll while open');
console.log('✓ Phase two: submit dialog colours, search debounce, delivery modal, category skeleton');

// Cart over-order advisory: ordering beyond stock is allowed (backorder request)
// but a clear warning is shown; the cart no longer silently clamps to stock.
const stockAdvisorySrc = readFileSync(join(root, 'src/lib/stockAdvisory.js'), 'utf8');
assert.match(stockAdvisorySrc, /export function stockAdvisoryForQty/, 'stockAdvisory helper is exported');
assert.match(stockAdvisorySrc, /isOverOrder/, 'advisory reports the over-order state + shortfall');
assert.doesNotMatch(appSrc, /if \(qty > 0\) return Math\.floor\(qty\);/, 'cart no longer silently clamps an in-stock line to available stock');
assert.match(cardSrc, /stockAdvisoryForQty/, 'product card surfaces the stock advisory');
assert.match(drawerSrc, /stockAdvisoryForQty/, 'cart drawer surfaces the stock advisory per line');
console.log('✓ Cart over-order advisory: allow backorder + clear warning (no silent clamp)');

// Product-card quantity control: the visible left/right sections must also be
// the real click targets, rather than narrow icon buttons surrounded by space.
const cardCssSrc = readFileSync(join(root, 'src/components/ProductCard.css'), 'utf8');
assert.match(
  cardCssSrc,
  /grid-template-columns:\s*minmax\(0, 1fr\)\s+52px\s+minmax\(0, 1fr\)/,
  'quantity stepper gives decrease and increase equal full-width sections',
);
assert.match(cardCssSrc, /\.product-card \.qty-stepper button\s*\{[^}]*width:\s*100%/, 'quantity buttons fill their grid sections');
assert.match(cardSrc, /disabled=\{qty <= \(product\.minQty \|\| 1\)\}/, 'decrease disables at the minimum quantity');
assert.match(cardSrc, /Math\.min\(9999, current \+ 1\)/, 'increase respects the existing maximum quantity');
console.log('✓ Full-width quantity controls: equal click targets + safe limits');

console.log('\nAll portal smoke checks passed.');
