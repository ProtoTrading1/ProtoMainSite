import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstoreHistoryScroll } from '../src/lib/instoreHistoryScroll.js';

function fixture() {
  const listeners = new Map(), frames = new Map();
  let clock = 0, frameId = 0;
  const content = { scrollTop: 0, scrollLeft: 0, scrollHeight: 2000, clientHeight: 400,
    scrollTo({ top, left }) { this.scrollTop = Math.min(top, Math.max(0, this.scrollHeight - this.clientHeight)); this.scrollLeft = left; } };
  const root = { scrollHeight: 3000 };
  const win = { location: { hash: '#/?q=notebook&colour=Blue', href: 'http://fixture/#/?q=notebook&colour=Blue' },
    document: { querySelector: s => s === '.content-area' ? content : null, scrollingElement: root },
    scrollY: 0, scrollX: 0, innerHeight: 600,
    history: { state: { unrelated: 'preserved' }, replaceState(state) { this.state = state; } },
    performance: { now: () => clock },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    scrollTo({ top, left }) { this.scrollY = Math.min(top, root.scrollHeight - this.innerHeight); this.scrollX = left; },
  };
  const emit = (type, event = {}) => { for (const fn of listeners.get(type) || []) fn(event); };
  const tick = (ms = 16) => { clock += ms; const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn()); };
  const control = createInstoreHistoryScroll(win);
  const move = (hash, state = null, explicit = false) => {
    if (explicit) control.beforeNavigate(hash);
    win.location.hash = hash; win.location.href = `http://fixture/${hash}`; win.history.state = state;
    emit('popstate', { state });
    return control.transition();
  };
  const remember = () => ({ hash: win.location.hash, state: win.history.state });
  const scroll = (top, y) => { content.scrollTop = top; win.scrollY = y; emit('scroll'); };
  return { win, content, control, move, remember, scroll, tick, emit, frames, listeners };
}

function roundTrip(f) {
  f.scroll(700, 350);
  const main = f.remember();
  assert.equal(f.move('#/instore-products?q=8640000272', null, true), false);
  f.scroll(0, 0);
  assert.equal(f.move(main.hash, main.state), true);
  return main;
}

test('history return restores exact entry after ready layout, preserving other history state', () => {
  const f = fixture();
  assert.equal(f.win.history.state.unrelated, 'preserved');
  roundTrip(f);
  assert.equal(f.win.scrollY, 0, 'transition does not restore before App reports readiness');
  f.content.scrollHeight = 500;
  f.control.restoreWhenReady(); f.tick(); f.tick();
  assert.equal(f.content.scrollTop, 0, 'waits while chunked results cannot reach saved position');
  f.content.scrollHeight = 2000;
  f.tick(); assert.equal(f.content.scrollTop, 0, 'one stable layout frame is insufficient');
  f.tick();
  assert.equal(f.content.scrollTop, 700);
  assert.equal(f.win.scrollY, 350);
  assert.equal(f.frames.size, 0);
  f.control.dispose();
});

test('a new Main entry with the same URL and an unrelated history target never restore', () => {
  const f = fixture();
  f.scroll(700, 350); const original = f.remember();
  f.move('#/instore-products', null, true); f.scroll(0, 0);
  assert.equal(f.move(original.hash, null, true), false);
  const duplicate = f.remember();
  assert.notDeepEqual(duplicate.state, original.state);
  f.move('#/instore-products?q=bracelets', null, true); f.scroll(0, 0);
  assert.equal(f.move(original.hash, original.state), false, 'same URL is insufficient: the originating entry differs');
  assert.equal(f.control.restoreWhenReady(), undefined);
  assert.equal(f.win.scrollY, 0);
  f.control.dispose();
});

test('new navigation, same-entry actions and user input cancel queued restoration generations', () => {
  for (const interrupt of ['navigation', 'same-entry', 'input', 'dispose']) {
    const f = fixture(); const main = roundTrip(f);
    f.control.restoreWhenReady(); f.tick();
    if (interrupt === 'navigation') f.move('#/bags', null, true);
    if (interrupt === 'same-entry') { f.control.beforeNavigate(main.hash); f.control.sameEntry(); }
    if (interrupt === 'input') f.emit('wheel');
    if (interrupt === 'dispose') f.control.dispose();
    f.tick(); f.tick();
    assert.equal(f.content.scrollTop, 0, interrupt);
    assert.equal(f.win.scrollY, 0, interrupt);
    assert.equal(f.frames.size, 0, interrupt);
    f.control.dispose();
  }
});

test('forward/back revisits refresh the origin snapshot, including nested Instore routes', () => {
  const f = fixture(); const main = roundTrip(f);
  f.control.restoreWhenReady(); f.tick(); f.tick();
  f.scroll(900, 420);
  f.move('#/instore-products?page=2', null, true); const instore = f.remember();
  f.move('#/extended-range?q=bracelets', null, true); f.scroll(0, 0);
  assert.equal(f.move(main.hash, main.state), true);
  f.control.restoreWhenReady(); f.tick(); f.tick();
  assert.equal(f.content.scrollTop, 900);
  f.scroll(1000, 480);
  f.move(instore.hash, instore.state); f.scroll(0, 0);
  assert.equal(f.move(main.hash, main.state), true);
  f.control.restoreWhenReady(); f.tick(); f.tick();
  assert.equal(f.content.scrollTop, 1000);
  assert.equal(f.win.scrollY, 480);
  f.control.dispose();
});

test('shorter fresh results bound layout waiting and clamp once; cleanup removes listeners', () => {
  const f = fixture(); roundTrip(f);
  f.content.scrollHeight = 500;
  f.control.restoreWhenReady(); f.tick(1501);
  assert.equal(f.content.scrollTop, 100);
  assert.equal(f.win.scrollY, 350);
  assert.equal(f.frames.size, 0);
  f.control.dispose();
  assert.ok([...f.listeners.values()].every(set => set.size === 0));
});


test('traversing back through a new Main entry does not overwrite the original Instore origin', () => {
  const f = fixture();
  f.scroll(700, 350); const original = f.remember();
  f.move('#/instore-products', null, true); const instore = f.remember();
  f.scroll(0, 0); f.move(original.hash, null, true);
  f.scroll(200, 50);
  f.move(instore.hash, instore.state); f.scroll(0, 0);
  assert.equal(f.move(original.hash, original.state), true);
  f.control.restoreWhenReady(); f.tick(); f.tick();
  assert.equal(f.content.scrollTop, 700);
  assert.equal(f.win.scrollY, 350);
  f.control.dispose();
});

test('an already dequeued frame still cannot write after navigation or history-state replacement', () => {
  for (const interrupt of ['navigation', 'state']) {
    const f = fixture(); roundTrip(f);
    f.control.restoreWhenReady(); f.tick();
    const stale = [...f.frames.values()][0];
    if (interrupt === 'navigation') f.move('#/other', null, true);
    else f.win.history.state = {};
    stale(); f.tick();
    assert.equal(f.content.scrollTop, 0);
    assert.equal(f.win.scrollY, 0);
    f.control.dispose();
  }
});
