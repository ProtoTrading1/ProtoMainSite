import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeCartQuantity, stepCartQuantity } from '../src/lib/cartQuantity.js';
import { customerOrderStatus, orderVatSummary } from '../src/lib/orderPresentation.js';

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const drawerSource = fs.readFileSync(new URL('../src/components/Drawer.jsx', import.meta.url), 'utf8');
const checkoutSource = fs.readFileSync(new URL('../src/components/CheckoutModal.jsx', import.meta.url), 'utf8');
const confirmationSource = fs.readFileSync(new URL('../src/components/OrderConfirmModal.jsx', import.meta.url), 'utf8');
const reorderSource = fs.readFileSync(new URL('../src/components/ReorderModal.jsx', import.meta.url), 'utf8');
const profileSource = fs.readFileSync(new URL('../src/pages/ProfilePage.jsx', import.meta.url), 'utf8');

test('quantity stepping uses the current typed draft instead of stale persisted quantity', () => {
  assert.equal(stepCartQuantity('12', 3, 1), 13);
  assert.equal(stepCartQuantity('12', 3, -1), 11);
  assert.equal(stepCartQuantity('', 8, 1), 9);
  assert.equal(normalizeCartQuantity('10000'), 9999);
});

test('checkout failure can retry the retained options with one idempotency key', () => {
  assert.match(appSource, /lastCheckoutOptionsRef\.current = checkoutOptions/);
  assert.match(appSource, /lastCheckoutSubmissionRef\.current = \{/);
  assert.match(appSource, /fingerprint !== cartFingerprint\(cartItems\)/);
  assert.match(appSource, /if \(!checkoutRefRef\.current\) checkoutRefRef\.current = makeClientRef\(\)/);
  assert.match(appSource, /sendOrderEmail\(lastCheckoutOptionsRef\.current\)/);
  assert.match(appSource, /sendOrderEmail=\{sendOrderEmail\}/, 'mobile checkout awaits and retains failed form state');
  assert.match(confirmationSource, /onClick=\{isError \? onRetry : onClose\}/);
  assert.match(drawerSource, /if \(result\?\.ok\)/, 'failed submission leaves the delivery form intact');
  assert.match(confirmationSource, /onClick=\{isSending \? undefined : onClose\}/);
  assert.match(drawerSource, /disabled=\{submitting\}/);
});

test('basket clearing is undoable and inactivity no longer destroys the basket', () => {
  assert.match(appSource, /setClearedCartSnapshot\(/);
  assert.match(appSource, /const undoClearCart = useCallback/);
  assert.match(appSource, /intent: 'submitted_clear'/);
  assert.match(appSource, /submittedClearConflict/);
  assert.match(drawerSource, /undoButtonRef\.current\?\.focus/);
  assert.doesNotMatch(appSource, /cartClock - cartLastActivityAt[\s\S]{0,120}clearCart\(\)/);
  assert.match(drawerSource, /Older than seven days — kept until you clear or submit it/);
  assert.match(drawerSource, /role="progressbar"/);
});

test('order history explains customer status, VAT, delivery and pro-forma expectations', () => {
  assert.equal(customerOrderStatus('pending'), 'Request received');
  const totals = orderVatSummary({ total_ex_vat: 1150, discount_amount: 150 });
  assert.deepEqual(totals, {
    subtotalInclVat: 1150,
    discount: 150,
    totalInclVat: 1000,
    vatIncluded: 1000 * (15 / 115),
  });
  assert.match(profileSource, /estimated total incl\. VAT/);
  assert.match(profileSource, /Pro-forma:/);
  assert.match(profileSource, /Reorder these products/);
});

test('reorder dialog and post-order actions expose accessible recovery paths', () => {
  assert.match(reorderSource, /role="dialog"/);
  assert.match(reorderSource, /aria-modal="true"/);
  assert.match(reorderSource, /event\.key === 'Escape'/);
  assert.match(reorderSource, /minHeight: 44/);
  assert.match(confirmationSource, />\s*View order\s*</);
  assert.match(checkoutSource, />\s*Edit delivery address\s*</);
});

test('basket and checkout analytics never include line contents or free text', () => {
  assert.match(appSource, /basket_sync_failed/);
  assert.match(appSource, /basket_cleared/);
  assert.match(appSource, /checkout_validation_failed/);
  assert.match(appSource, /order_submit_failed/);
  assert.doesNotMatch(appSource, /metadata:\s*\{[^}]*customerNotes/s);
});
