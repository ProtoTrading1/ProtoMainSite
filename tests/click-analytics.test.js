import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShoppingEvent } from '../api/_shopping-event.js';
import { cleanClickLabel, describeClick, startClickAnalytics } from '../src/lib/clickAnalytics.js';

const base = { eventId: 'f2761d6e-01fb-4c67-b6e9-b418c829035f', sessionId: 'ed130931-a3f5-4207-bd1f-25989291ce03' };

// Minimal element double: a chain of nodes, each matching a set of selectors.
function node({ selectors = [], attrs = {}, text = '', svg = false, parent = null } = {}) {
  const el = {
    parent,
    getAttribute: (name) => attrs[name] ?? null,
    textContent: text,
    querySelector: (sel) => (sel === 'svg' && svg ? {} : null),
    matches: (sel) => sel.split(',').map((s) => s.trim()).some((s) => selectors.includes(s)),
    closest(sel) { for (let cur = el; cur; cur = cur.parent) if (cur.matches(sel)) return cur; return null; },
  };
  return el;
}

test('site clicks keep only area, label and kind metadata and need both area and label', () => {
  const row = normalizeShoppingEvent({ ...base, eventType: 'site_clicked', metadata: { area: 'Header', label: 'Specials', kind: 'button', email: 'x@y.z' } });
  assert.equal(row.event_type, 'site_clicked');
  assert.deepEqual(row.metadata, { area: 'Header', label: 'Specials', kind: 'button' });
  assert.throws(() => normalizeShoppingEvent({ ...base, eventType: 'site_clicked', metadata: { area: 'Header' } }));
  assert.throws(() => normalizeShoppingEvent({ ...base, eventType: 'site_clicked' }));
});

test('labels never carry email addresses or long numbers', () => {
  assert.equal(cleanClickLabel('  Add   to basket '), 'Add to basket');
  assert.equal(cleanClickLabel('jo@shop.co.za'), '');
  assert.equal(cleanClickLabel('Call 082 555 1234'), 'Call #');
  assert.equal(cleanClickLabel('4mm beads'), '4mm beads');
  assert.ok(cleanClickLabel('x'.repeat(100)).length <= 60);
});

test('a click is described by its area, label and product, inputs and ignored regions are skipped', () => {
  const card = node({ selectors: ['.product-card', '[data-product-code]'], attrs: { 'data-product-code': 'SKU-9' } });
  const add = node({ selectors: ['button'], attrs: { 'aria-label': 'Add to basket' }, parent: card });
  assert.deepEqual(describeClick(add), { area: 'Product card', label: 'Add to basket', kind: 'product', productId: 'SKU-9' });

  const header = node({ selectors: ['.app-header', 'header'] });
  const link = node({ selectors: ['a[href]'], text: 'Specials', parent: header });
  assert.deepEqual(describeClick(link), { area: 'Header', label: 'Specials', kind: 'link', productId: null });

  const quiet = node({ selectors: ['[data-track-ignore]'] });
  assert.equal(describeClick(node({ selectors: ['button'], text: 'Hi', parent: quiet })), null);
  assert.equal(describeClick(node({ selectors: ['div'], text: 'Plain text' })), null);
  assert.equal(describeClick(node({ selectors: ['button'], svg: true })).label, 'Icon button');
});

test('the listener records clicks once, drops instant double clicks and never throws', () => {
  let handler; const sent = [];
  const doc = { addEventListener: (_t, fn) => { handler = fn; }, removeEventListener: () => { handler = null; } };
  let t = 1000;
  const stop = startClickAnalytics({ doc, track: (type, fields) => sent.push([type, fields]), now: () => t });
  const button = node({ selectors: ['button'], text: 'Checkout' });
  handler({ target: button }); handler({ target: button });
  t += 2000; handler({ target: button });
  handler({ target: null });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], ['site_clicked', { metadata: { area: 'Page', label: 'Checkout', kind: 'button' } }]);
  stop(); assert.equal(handler, null);
});
