// Scroll snapshots stay in this mounted portal only. History holds an opaque
// entry id, never catalogue rows, customer data, or a persistent scroll cache.
const ENTRY_KEY = '__protoInstoreReturnEntry';
const SELECTORS = ['.content-area', '.main-layout', '.app-root'];
let sequence = 0;

const isInstore = hash => /^#\/?(?:instore-products|extended-range)(?:[/?]|$)/.test(hash);

export function createInstoreHistoryScroll(win) {
  const doc = win.document;
  const entries = new Map();
  let generation = 0, pending = null, explicitHash = null, traversalId = null;
  const snapshot = () => ({
    window: { top: win.scrollY, left: win.scrollX },
    containers: SELECTORS.map(selector => {
      const el = doc.querySelector(selector);
      return { selector, top: el?.scrollTop || 0, left: el?.scrollLeft || 0 };
    }),
  });
  const newEntry = () => {
    const hash = win.location.hash;
    const id = `${Date.now().toString(36)}-${++sequence}`;
    win.history.replaceState({ ...win.history.state, [ENTRY_KEY]: id }, '', win.location.href);
    const entry = { id, hash, instore: isInstore(hash), scroll: snapshot(), origin: null };
    entries.set(id, entry);
    // This is route continuity, not an unbounded session history mirror.
    if (entries.size > 64) entries.delete(entries.keys().next().value);
    return entry;
  };
  let current = newEntry();

  const stopFrame = ticket => {
    if (ticket?.frame != null) win.cancelAnimationFrame(ticket.frame);
    if (ticket) ticket.frame = null;
  };
  const cancel = () => {
    generation++;
    stopFrame(pending);
    pending = null;
  };
  const capture = () => {
    if (!current.instore && !pending && win.location.hash === current.hash) current.scroll = snapshot();
  };
  const onPopState = event => {
    const id = event.state?.[ENTRY_KEY];
    traversalId = !explicitHash && entries.get(id)?.hash === win.location.hash ? id : null;
    // Cancel queued work before the later hashchange or React commit.
    cancel();
    // Traversing duplicate-URL entries emits popstate without hashchange.
    if (traversalId && win.location.hash === current.hash) {
      current = entries.get(traversalId);
      traversalId = null;
      capture();
    }
  };
  const onInput = () => { if (pending) cancel(); };
  win.addEventListener('popstate', onPopState);
  win.addEventListener('scroll', capture, true);
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) win.addEventListener(type, onInput, true);

  return {
    beforeNavigate(hash) {
      capture();
      cancel();
      explicitHash = hash;
      traversalId = null;
    },
    sameEntry() { explicitHash = null; capture(); },
    transition() {
      const previous = current;
      const hash = win.location.hash;
      const traversed = explicitHash === null && traversalId;
      let next = traversed ? entries.get(traversalId) : null;
      if (!next || next.hash !== hash) next = newEntry();
      cancel();
      if (!previous.instore && next.instore && (!traversed || !next.origin || next.origin.id === previous.id)) {
        next.origin = { id: previous.id, hash: previous.hash, scroll: previous.scroll };
      }
      else if (previous.instore && next.instore && !next.origin) next.origin = previous.origin;
      const origin = previous.origin;
      if (traversed && previous.instore && !next.instore && origin?.id === next.id && origin.hash === hash) {
        pending = { id: next.id, hash, scroll: origin.scroll, generation, frame: null };
      }
      current = next;
      explicitHash = null;
      traversalId = null;
      return Boolean(pending);
    },
    // App calls this only once Main's own query/result state is ready. Two
    // frames then wait for sufficient layout height (including chunked rows).
    restoreWhenReady() {
      const ticket = pending;
      if (!ticket || ticket.frame != null) return undefined;
      const started = win.performance.now();
      let readyFrames = 0;
      const valid = () => pending === ticket && generation === ticket.generation
        && win.location.hash === ticket.hash && win.history.state?.[ENTRY_KEY] === ticket.id;
      const tick = () => {
        ticket.frame = null;
        if (!valid()) return;
        const root = doc.scrollingElement || doc.documentElement;
        const room = (root?.scrollHeight || 0) - win.innerHeight >= ticket.scroll.window.top
          && ticket.scroll.containers.every(({ selector, top }) => {
            const el = doc.querySelector(selector);
            return top === 0 || (el && el.scrollHeight - el.clientHeight >= top);
          });
        readyFrames = room ? readyFrames + 1 : 0;
        // Fresh results can legitimately be shorter. Bound waiting, then let
        // the browser clamp to their actual extent rather than fight the user.
        if (readyFrames < 2 && win.performance.now() - started < 1500) {
          ticket.frame = win.requestAnimationFrame(tick);
          return;
        }
        if (!valid()) return;
        pending = null;
        for (const { selector, top, left } of ticket.scroll.containers) doc.querySelector(selector)?.scrollTo({ top, left, behavior: 'instant' });
        win.scrollTo({ ...ticket.scroll.window, behavior: 'instant' });
      };
      ticket.frame = win.requestAnimationFrame(tick);
      return () => stopFrame(ticket);
    },
    dispose() {
      cancel();
      win.removeEventListener('popstate', onPopState);
      win.removeEventListener('scroll', capture, true);
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) win.removeEventListener(type, onInput, true);
    },
  };
}
