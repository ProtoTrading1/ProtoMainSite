import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/components/CustomerDashboard.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('signed-in customers receive a useful in-page dashboard', () => {
  assert.match(app, /<CustomerDashboard/);
  assert.match(dashboard, /hasReturningContext \? `Welcome back, \$\{firstName\(customer\)\}` : `Welcome, \$\{firstName\(customer\)\}`/);
  assert.match(dashboard, /Your order is ready to continue/);
  assert.match(dashboard, /Your first online order starts here/);
  assert.match(dashboard, /Choose products to sell/);
  assert.match(dashboard, /Continue order/);
  assert.match(dashboard, /Browse catalogue/);
  assert.match(dashboard, /Buy again/);
  assert.match(dashboard, /historyState, setHistoryState/);
  assert.match(dashboard, /Checking your account history/);
  assert.match(dashboard, /We couldn’t load your orders/);
  assert.match(dashboard, /Start with a department/);
  assert.match(dashboard, /!hasOrders \? <div className="customer-dashboard-cart-start">/);
  assert.match(dashboard, /hasReturningContext = historyState === 'ready' && \(hasOrders \|\| hasCart\)/);
  assert.match(dashboard, /Your details/);
  assert.doesNotMatch(dashboard, /Account status/i);
  assert.doesNotMatch(dashboard, /Popular with trade customers/);
  assert.match(dashboard, /if \(!customer\?\.id\) return null/);
  assert.doesNotMatch(dashboard, /R18,450/);
});

test('welcome links to existing order history without creating another customer flow', () => {
  assert.match(app, /onViewOrders=\{onViewProfile\}/);
  assert.match(app, /onBrowseDepartment=/);
  assert.match(app, /cartItemCount=\{totalItemCount\}/);
  assert.match(app, /onOpenCart=\{handleCartOpen\}/);
  assert.match(app, /lastOrderLoaded/);
  assert.match(app, /showWelcome=\{showWelcome && \(!customer\?\.id \|\| \(lastOrderLoaded && !lastOrder\)\)\}/);
  assert.match(app, /WELCOME_SEEN_PREFIX/);
  assert.match(app, /markWelcomeSeen\(customer\.id\)/);
  assert.match(app, /WELCOME_DISPLAY_MS = 5500/);
  assert.match(app, /welcomeDurationMs/);
  assert.match(dashboard, /Recent orders/);
  assert.match(dashboard, /View all orders/);
  assert.match(dashboard, /onClick=\{hasCart \? onOpenCart : onContinueShopping\}/);
  assert.doesNotMatch(app, /FirstLoginBuyingAssistant/);
  assert.doesNotMatch(styles, /buying-assistant/);
  assert.equal(fs.existsSync(new URL('../migrations/064_customer_buying_assistant.sql', import.meta.url)), false);
});

test('dashboard resolves repeat products beyond the visible catalogue page', () => {
  assert.match(dashboard, /fetchProductsBySkus/);
  assert.match(dashboard, /item\.productId \|\| item\.product_id \|\| item\.code \|\| item\.sku/);
  assert.match(dashboard, /Previous products are not currently available online/);
});
