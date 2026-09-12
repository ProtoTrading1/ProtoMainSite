import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActivityEvent, buildActiveInterval, createActivityQueue, createApolloActivityReporter, startActiveTimeLifecycle } from '../src/lib/apolloActivity.js';
const session = 'a9894746-a04f-4d6d-82b3-4a3819354565';
const event = () => buildActivityEvent({ eventType: 'category_view', source: 'main', sessionId: session, categoryId: 'home' });
test('requires supplied session and valid source', () => { assert.throws(() => buildActivityEvent({ eventType: 'category_view', source: 'main' })); assert.throws(() => buildActivityEvent({ eventType: 'category_view', source: 'other', sessionId: session, categoryId: 'x' })); });
test('search stores completed fields without identity', () => { const e = buildActivityEvent({ eventType: 'search_completed', source: 'instore', sessionId: session, original: ' Mug ', normalized: 'mug', resultsCount: 0 }); assert.deepEqual(e.search, { original: 'Mug', normalized: 'mug', results_count: 0 }); assert.equal('customer_id' in e, false); });
test('product kind and variant parent are explicit', () => { assert.throws(() => buildActivityEvent({ eventType: 'product_view', source: 'main', sessionId: session, productId: 'x' })); assert.equal(buildActivityEvent({ eventType: 'product_view', source: 'main', sessionId: session, productKind: 'variant', productId: 'v', parentId: 'p' }).product.parent_id, 'p'); });
test('rejects invalid payloads', () => { assert.throws(() => buildActivityEvent({ eventType: 'cart_item_added', source: 'main', sessionId: session, productId: 'x', quantity: 0 })); assert.throws(() => buildActivityEvent({ eventType: 'nope', source: 'main', sessionId: session })); });
test('clips active interval to sixty seconds', () => { const e = buildActiveInterval({ source: 'main', sessionId: session, visible: true, intervalStart: 0, visibleSince: 0, lastInteractionAt: 59000, now: 120000 }); assert.equal(e.interval.seconds, 60); assert.equal(e.interval.start_at, new Date(60000).toISOString()); });
test('rejects hidden, clips idle cutoff, and rejects missing timestamps', () => { assert.equal(buildActiveInterval({ source: 'main', sessionId: session, visible: false, intervalStart: 1, visibleSince: 1, lastInteractionAt: 1, now: 2 }), null); const clipped = buildActiveInterval({ source: 'main', sessionId: session, visible: true, intervalStart: 1, visibleSince: 1, lastInteractionAt: 0, now: 121000 }); assert.ok(clipped); assert.equal(Date.parse(clipped.interval.end_at), 120000); assert.throws(() => buildActiveInterval({ source: 'main', sessionId: session, visible: true, intervalStart: null, visibleSince: 1, lastInteractionAt: 1, now: 2 })); });
test('rejects non-positive interval and queue limits', () => { assert.equal(buildActiveInterval({ source: 'main', sessionId: session, visible: true, intervalStart: 10, visibleSince: 10, lastInteractionAt: 10, now: 10 }), null); assert.throws(() => createActivityQueue({ maxQueue: 0 })); });
test('bounds queue including in-flight work', () => { const q = createActivityQueue({ enabled: true, maxQueue: 100, send: () => new Promise(() => {}) }); for (let i = 0; i < 101; i += 1) q.enqueue(event()); assert.equal(q.dropped(), 1); });
test('drains 45 events serially in batches', async () => { let active = 0; let peak = 0; let total = 0; const q = createActivityQueue({ enabled: true, batchSize: 20, send: async (batch) => { active += 1; peak = Math.max(peak, active); total += batch.length; await Promise.resolve(); active -= 1; } }); for (let i = 0; i < 45; i += 1) q.enqueue(event()); await q.flush(); assert.deepEqual([total, peak], [45, 1]); });
test('failure exhaustion drops and preserves ID', async () => { const ids = []; const send = async (batch) => { ids.push(batch[0].event_id); throw Error('offline'); }; const q = createActivityQueue({ enabled: true, maxRetries: 1, send }); const e = event(); q.enqueue(e); await q.flush(); await q.flush(); assert.equal(ids[0], e.event_id); assert.equal(q.dropped(), 1); });
test('dispose clears queued work', () => { const q = createActivityQueue({ enabled: true, send: async () => {} }); q.enqueue(event()); q.dispose(); assert.equal(q.size(), 0); });
test('reporter is inert unless enabled and never accepts customer identity', async () => { const sent = []; const off = createApolloActivityReporter({ sessionId: session, send: async (batch) => sent.push(...batch) }); assert.equal(off.record('category_view', { source: 'main', categoryId: 'home' }), false); const on = createApolloActivityReporter({ enabled: true, sessionId: session, send: async (batch) => sent.push(...batch), now: () => 1000 }); assert.equal(on.record('search_completed', { source: 'main', original: 'Mugs', normalized: 'mugs', resultsCount: 2 }), true); await on.flush(); assert.equal(sent.length, 1); assert.equal('customer_id' in sent[0], false); });
test('active lifecycle requires visible interaction and reports at most one-minute slices', () => {
  let clock = 0;
  let timer;
  const listeners = new Map();
  const documentRef = {
    visibilityState: 'visible',
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const intervals = [];
  const stop = startActiveTimeLifecycle({
    enabled: true,
    reporter: { recordActiveInterval: (fields) => { intervals.push(fields); return true; } },
    getSource: () => 'instore',
    documentRef,
    now: () => clock,
    setIntervalFn: (fn, ms) => { assert.equal(ms, 60000); timer = fn; return 'timer'; },
    clearIntervalFn: (id) => assert.equal(id, 'timer'),
  });
  timer();
  assert.equal(intervals.length, 0);
  clock = 1000;
  listeners.get('pointerdown')();
  clock = 61000;
  timer();
  assert.deepEqual(intervals[0], { source: 'instore', visible: true, intervalStart: 1000, visibleSince: 0, lastInteractionAt: 1000 });
  assert.equal('customer_id' in intervals[0], false);
  documentRef.visibilityState = 'hidden';
  clock = 90000;
  listeners.get('visibilitychange')();
  assert.equal(intervals.length, 2);
  documentRef.visibilityState = 'visible';
  clock = 100000;
  listeners.get('visibilitychange')();
  clock = 160000;
  timer();
  assert.equal(intervals.length, 2, 'showing a tab without a new interaction is not active time');
  stop();
  assert.equal(listeners.size, 0);
});
test('active lifecycle does not count a gap before interaction resumes after idle', () => {
  let clock = 0;
  let timer;
  const listeners = new Map();
  const documentRef = { visibilityState: 'visible', addEventListener(type, handler) { listeners.set(type, handler); }, removeEventListener(type) { listeners.delete(type); } };
  const intervals = [];
  const stop = startActiveTimeLifecycle({ enabled: true, reporter: { recordActiveInterval: (fields) => { intervals.push(fields); return true; } }, getSource: () => 'main', documentRef, now: () => clock, setIntervalFn: (fn) => { timer = fn; return 1; }, clearIntervalFn: () => {} });
  listeners.get('keydown')();
  clock = 60000;
  timer();
  clock = 181000;
  listeners.get('scroll')();
  clock = 241000;
  timer();
  assert.equal(intervals[1].intervalStart, 181000);
  stop();
});
test('active lifecycle discards an ambiguous interval when the source changes', () => {
  let clock = 0; let timer; let source = 'main'; const listeners = new Map(); const intervals = [];
  const documentRef = { visibilityState: 'visible', addEventListener(type, handler) { listeners.set(type, handler); }, removeEventListener(type) { listeners.delete(type); } };
  const stop = startActiveTimeLifecycle({ enabled: true, reporter: { recordActiveInterval: (fields) => { intervals.push(fields); return true; } }, getSource: () => source, documentRef, now: () => clock, setIntervalFn: (fn) => { timer = fn; return 1; }, clearIntervalFn: () => {} });
  listeners.get('pointerdown')();
  source = 'instore'; clock = 60000; timer();
  assert.equal(intervals.length, 0);
  listeners.get('pointerdown')(); clock = 120000; timer();
  assert.equal(intervals.length, 1); assert.equal(intervals[0].source, 'instore');
  stop();
});
