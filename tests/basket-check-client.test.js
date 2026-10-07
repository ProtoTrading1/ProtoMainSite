import test from 'node:test';
import assert from 'node:assert/strict';
import { readSession, referenceReport, mountBasketCheck } from '../public/basket-check.js';
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const REF = '00000000-0000-4000-8000-000000000003';
const KEY = 'sb-abcdefghijklmnopqrst-auth-token';
const session = (id = A) => JSON.stringify({ access_token: 'abc.def.ghi', expires_at: 9999999999, user: { id } });
const intent = (id = A) => ({ version: 1, customerId: id, payload: { clientRef: REF, items: [{ private: 'PRIVATE ITEM' }] }, items: [{}], fingerprint: 'PRIVATE BASKET', total: 10, options: {} });
test('report is restricted to exactly five fields and no secrets or basket data', () => {
  const report = referenceReport(JSON.stringify(intent()), A, 'proto.co.za');
  assert.deepEqual(report, { hostname: 'proto.co.za', clientRef: REF, version: 1, lineCount: 1, hasResult: false });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|customerId|token|total/);
});
test('missing, corrupt, cross-account, malicious reference and oversized journals fail closed', () => {
  for (const raw of [null, '{', JSON.stringify(intent(B)), JSON.stringify({ ...intent(), payload: { ...intent().payload, clientRef: '<img onerror=alert(1)>' } }), 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    assert.throws(() => referenceReport(raw, A, 'proto.co.za'));
  }
});
test('session parser rejects missing, corrupt, expired, foreign identity and malformed tokens', () => {
  assert.equal(readSession(session(), 0).customerId, A);
  for (const raw of [null, '{}', '{', JSON.stringify({ access_token: 'abc.def.ghi', user: { id: A }, expires_at: 1 }), session('x'), session().replace('abc.def.ghi', '<secret>')]) assert.throws(() => readSession(raw, 2000));
});
function fixture({ identity = A, mutate } = {}) {
  const ids = ['check-button', 'status', 'report', 'consent', 'copy-button', 'copy-status'];
  const elements = Object.fromEntries(ids.map(id => [id, { textContent: '', hidden: true, checked: false, disabled: true, addEventListener() {} }]));
  const values = new Map([[KEY, session()], [`proto_pending_checkout_v1:${A}`, JSON.stringify(intent())], [`proto_pending_checkout_v1:${B}`, 'PRIVATE FOREIGN']]);
  const reads = [], requests = [], copies = [];
  const events = {};
  const storage = { getItem(key) { reads.push(key); return values.get(key) ?? null; }, setItem() { assert.fail('storage write'); }, removeItem() { assert.fail('storage removal'); }, key() { assert.fail('storage enumeration'); } };
  const document = { hidden: false, getElementById: id => elements[id], addEventListener: (name, fn) => { events[name] = fn; } };
  const window = { location: { hostname: 'proto.co.za', protocol: 'https:' }, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, addEventListener: (name, fn) => { events[name] = fn; } };
  window.top = window.self = window;
  const fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('identity')) mutate?.(values);
    return { ok: true, text: async () => JSON.stringify({ version: 1, sessionStorageKey: KEY, ...(url.endsWith('identity') ? { customerId: identity } : {}) }) };
  };
  const controller = mountBasketCheck({ document, window, fetch, storage, clipboard: { writeText: async value => { copies.push(value); } }, now: () => 0 });
  return { controller, elements, values, reads, requests, copies, events, document };
}
test('explicit check and consent precede copying; only exact session and owned journal read, GET only', async () => {
  const f = fixture();
  assert.equal(f.requests.length, 0);
  await f.controller.check();
  assert.equal(f.copies.length, 0);
  await f.controller.copy();
  assert.equal(f.copies.length, 0);
  f.elements.consent.checked = true;
  await f.controller.copy();
  assert.equal(f.copies.length, 1);
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every(r => r.options.method === 'GET' && r.url.startsWith('/api/basket-check-session?mode=')));
  assert.deepEqual([...new Set(f.reads)].sort(), [KEY, `proto_pending_checkout_v1:${A}`].sort());
  assert.doesNotMatch(f.copies[0], /PRIVATE|abc.def.ghi|customerId/);
});
test('server identity mismatch and account change during verification hold without journal export', async () => {
  for (const settings of [{ identity: B }, { mutate: values => values.set(KEY, session(B)) }]) {
    const f = fixture(settings); await f.controller.check();
    assert.equal(f.elements.report.hidden, true); assert.equal(f.elements.consent.disabled, true); assert.equal(f.copies.length, 0);
  }
});
test('session and journal changes invalidate preview and prevent copy', async () => {
  for (const key of [KEY, `proto_pending_checkout_v1:${A}`]) {
    const f = fixture(); await f.controller.check(); f.elements.consent.checked = true;
    f.values.set(key, 'changed'); await f.controller.copy();
    assert.equal(f.copies.length, 0); assert.equal(f.elements.report.hidden, true); assert.equal(f.elements['copy-button'].disabled, true);
  }
});
test('storage event and hidden page discard verified preview', async () => {
  for (const event of ['storage', 'visibilitychange']) {
    const f = fixture(); await f.controller.check();
    if (event === 'visibilitychange') { f.document.hidden = true; f.events[event](); } else f.events[event]({ key: KEY });
    assert.equal(f.elements.report.hidden, true);
    f.controller.destroy(); assert.equal(f.elements.report.hidden, true);
  }
});
