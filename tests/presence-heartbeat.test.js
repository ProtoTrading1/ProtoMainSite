import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSessionId } from '../api/presence.js';

/**
 * The presence heartbeat is what the admin dashboard's live shopper count is
 * built on, and it runs in every open storefront tab. These cover the two
 * things that would otherwise go wrong quietly: a bad session id reaching a
 * uuid column, and the loop beating while nobody is looking at the page.
 */

test('a well-formed session id is passed through', () => {
  const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
  assert.equal(normalizeSessionId(id), id);
  assert.equal(normalizeSessionId(`  ${id}  `), id);
});

test('anything that is not a uuid is dropped rather than sent to a uuid column', () => {
  ['', 'not-a-uuid', '123', null, undefined, 42, {}, []].forEach((value) => {
    assert.equal(normalizeSessionId(value), null, `expected ${JSON.stringify(value)} to be dropped`);
  });
});

/** Loads the client heartbeat against stubbed browser globals. */
async function withStubbedBrowser(run, { visibilityState = 'visible' } = {}) {
  const timers = [];
  const listeners = {};
  const calls = [];

  const doc = {
    visibilityState,
    addEventListener(type, fn) { listeners[type] = fn; },
    removeEventListener(type) { delete listeners[type]; },
  };

  globalThis.window = {
    sessionStorage: { getItem: () => '3f2504e0-4f89-11d3-9a0c-0305e82c3301' },
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearInterval: (id) => { timers[id - 1] = null; },
  };
  globalThis.document = doc;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    return { ok: true };
  };

  const { startPresenceHeartbeat: rawStart, HEARTBEAT_MS } = await import('../src/lib/presence.js');
  // Inject a token so the send path is exercised without a real Supabase session.
  const startPresenceHeartbeat = (opts = {}) => rawStart({ getToken: async () => 'test-token', ...opts });

  try {
    await run({
      startPresenceHeartbeat,
      rawStart,
      HEARTBEAT_MS,
      doc,
      listeners,
      timers,
      calls,
      settle: () => new Promise((resolve) => setImmediate(resolve)),
    });
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.fetch;
  }
}

test('one beat per minute, so the admin window of 150s always spans two', async () => {
  await withStubbedBrowser(({ HEARTBEAT_MS, timers, startPresenceHeartbeat }) => {
    assert.equal(HEARTBEAT_MS, 60000);
    startPresenceHeartbeat();
    assert.equal(timers[0].ms, HEARTBEAT_MS);
  });
});

test('a hidden tab stops beating and resumes on return', async () => {
  await withStubbedBrowser(async ({ startPresenceHeartbeat, doc, listeners, timers, settle }) => {
    startPresenceHeartbeat();
    await settle();
    assert.equal(timers.filter(Boolean).length, 1, 'visible tab beats');

    doc.visibilityState = 'hidden';
    listeners.visibilitychange();
    assert.equal(timers.filter(Boolean).length, 0, 'a backgrounded tab costs nothing');

    doc.visibilityState = 'visible';
    listeners.visibilitychange();
    assert.equal(timers.filter(Boolean).length, 1, 'returning resumes the beat');
  });
});

test('a tab that opens hidden never starts beating', async () => {
  await withStubbedBrowser(({ startPresenceHeartbeat, timers }) => {
    startPresenceHeartbeat();
    assert.equal(timers.filter(Boolean).length, 0);
  }, { visibilityState: 'hidden' });
});

test('no session means no beat at all — never an unauthenticated request', async () => {
  await withStubbedBrowser(async ({ rawStart, calls, settle }) => {
    const stop = rawStart({ getToken: async () => null });
    await settle();
    assert.equal(calls.length, 0);
    stop();
  });
});

test('stopping clears the row so the count drops immediately', async () => {
  await withStubbedBrowser(async ({ startPresenceHeartbeat, calls, settle, timers }) => {
    const stop = startPresenceHeartbeat();
    await settle();
    assert.equal(calls[0].method, 'POST', 'beats once straight away');

    stop();
    await settle();
    assert.equal(calls.at(-1).method, 'DELETE');
    assert.equal(timers.filter(Boolean).length, 0, 'no timer survives the stop');
  });
});
