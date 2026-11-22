// Real router with synthetic Main layout and a controllable restoration gate.
// Test fixture only; no services, account, or runtime controller changes.
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { useHashNav } from '../../src/hooks/useHashNav.js';
if (location.hostname !== '127.0.0.1') throw Error('Local fixture only');
window.history.scrollRestoration = 'manual';

// Hold the actual callback scheduled by restoreWhenReady, not a transient
// loading label. Retain cancelled callbacks so release also tests a stale
// callback that was already dequeued when navigation cancelled its generation.
const restorationGate = (() => {
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  const callbacks = new Map(), listeners = new Set();
  let held = false, nextId = -1, cancelled = 0, delivered = 0;
  const snapshot = () => ({ held, queued: [...callbacks.values()].filter(item => !item.cancelled).length, retained: callbacks.size, cancelled, delivered });
  const publish = () => { for (const listener of listeners) listener(snapshot()); };
  window.requestAnimationFrame = callback => {
    if (!held) return request(callback);
    const id = nextId--;
    callbacks.set(id, { callback, cancelled: false });
    publish();
    return id;
  };
  window.cancelAnimationFrame = id => {
    const item = callbacks.get(id);
    if (!item) return cancel(id);
    if (!item.cancelled) { item.cancelled = true; cancelled++; publish(); }
  };
  return {
    snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hold() { held = true; publish(); },
    release() {
      held = false;
      const pending = [...callbacks.values()];
      callbacks.clear();
      publish();
      for (const item of pending) request(timestamp => {
        // Deliberately deliver cancelled work once; runtime guards must reject it.
        try { item.callback(timestamp); } finally { delivered++; publish(); }
      });
    },
  };
})();
export default function Fixture() {
  const { path, navigate, restoreInstoreReturnScroll } = useHashNav();
  const [ready, setReady] = useState(false);
  const [gate, setGate] = useState(restorationGate.snapshot);
  useEffect(() => restorationGate.subscribe(setGate), []);
  const main = path.length === 0;
  // The away destination must have room for the old offsets; otherwise a
  // stale scroll write would clamp to zero and falsely pass cancellation.
  const scrollable = (main && ready) || path[0] === 'other';
  useEffect(() => {
    setReady(false);
    if (!main) return undefined;
    const timer = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(timer);
  }, [main]);
  useEffect(() => {
    if (main && ready) return restoreInstoreReturnScroll();
    return undefined;
  }, [main, ready, restoreInstoreReturnScroll]);
  return <><nav style={{ position: 'fixed', top: 0, left: 0, zIndex: 10, background: 'white', display: 'flex', flexWrap: 'wrap', maxWidth: '100%' }}><button onClick={() => navigate(['instore-products'])}>Instore</button><button onClick={() => navigate([], { q: 'notebook' })}>New Main</button><button onClick={() => navigate(['other'])}>Other</button><button onClick={restorationGate.hold}>Hold restoration readiness</button><button onClick={restorationGate.release}>Release restoration readiness</button><output data-testid="restoration-gate" data-held={gate.held} data-queued={gate.queued} data-retained={gate.retained} data-cancelled={gate.cancelled} data-delivered={gate.delivered}>{gate.queued ? 'Restoration pending' : gate.held ? 'Restoration readiness held' : 'Restoration readiness released'}</output></nav><main style={{ minHeight: scrollable ? 2600 : 200 }}><h1>{main ? ready ? 'Main ready' : 'Main loading' : path[0]}</h1><div className="content-area" style={{ height: 220, overflow: 'auto', marginTop: 80 }}><div style={{ height: scrollable ? 2200 : 100 }}>Synthetic content</div></div></main></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
