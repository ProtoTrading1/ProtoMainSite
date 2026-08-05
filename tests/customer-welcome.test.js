import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../src/components/CustomerDashboard.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('signed-in customers receive a useful in-page dashboard', () => {
  assert.match(app, /<CustomerDashboard/);
  assert.match(dashboard, /hasOrders \? `Welcome back, \$\{firstName\(customer\)\}` : `Welcome, \$\{firstName\(customer\)\}`/);
  assert.match(dashboard, /Your order is ready to continue/);
  assert.match(dashboard, /Your first online order starts here/);
  assert.match(dashboard, /Continue order/);
  assert.match(dashboard, /Browse catalogue/);
  assert.match(dashboard, /Buy again/);
  assert.match(dashboard, /!hasReturningContext \? null/);
  assert.match(dashboard, /!hasOrders \? <div className="customer-dashboard-cart-start">/);
  assert.match(dashboard, /hasReturningContext = hasOrders \|\| hasCart/);
  assert.match(dashboard, /Your details/);
  assert.doesNotMatch(dashboard, /Account status/i);
  assert.doesNotMatch(dashboard, /Popular with trade customers/);
  assert.match(dashboard, /if \(!customer\?\.id\) return null/);
  assert.doesNotMatch(dashboard, /R18,450/);
});

test('welcome links to existing order history without creating another customer flow', () => {
  assert.match(app, /onViewOrders=\{onViewProfile\}/);
  assert.match(app, /cartItemCount=\{totalItemCount\}/);
  assert.match(app, /onOpenCart=\{handleCartOpen\}/);
  assert.match(dashboard, /Recent orders/);
  assert.match(dashboard, /View all orders/);
  assert.match(dashboard, /onClick=\{hasCart \? onOpenCart : onContinueShopping\}/);
  assert.doesNotMatch(app, /FirstLoginBuyingAssistant/);
  assert.doesNotMatch(styles, /buying-assistant/);
  assert.equal(fs.existsSync(new URL('../migrations/064_customer_buying_assistant.sql', import.meta.url)), false);
});
