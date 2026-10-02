import { trackShoppingEvent } from '../lib/shoppingAnalytics';
import { useCallback, useEffect, useRef, useState } from 'react';

const SEEN = 'proto_search_tip_seen_v1';
const DISMISSED = 'proto_search_tip_dismissed_v1';
const VISIT = 'proto_search_tip_visit_v1';
const REMINDER_MS = 4 * 60 * 1000;
const DISPLAY_MS = 12000;
const memory = new Map();
function read(store, key) {
  try { return JSON.parse(store.getItem(key) || 'null'); } catch { return memory.get(key); }
}
function write(store, key, value) {
  memory.set(key, value);
  try { store.setItem(key, JSON.stringify(value)); } catch { /* memory prevents repeats */ }
}

export default function useSearchTip({ accountId, ready, browsing, searched, engaged, blocked }) {
  const [stage, setStage] = useState(null);
  const [anchorTop, setAnchorTop] = useState(140);
  const [anchorLeft, setAnchorLeft] = useState(20);
  const [anchorWidth, setAnchorWidth] = useState(430);
  const visitRef = useRef(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const header = document.querySelector('.app-header');
    if (!header) return undefined;
    const measure = () => {
      setAnchorTop(Math.max(12, header.getBoundingClientRect().bottom + 12));
      const grid = document.querySelector('.product-grid, .catalog-instore-grid, .instore-grid');
      const content = document.querySelector('.content-area');
      const left = grid?.getBoundingClientRect().left ?? (content
        ? content.getBoundingClientRect().left + parseFloat(getComputedStyle(content).paddingLeft || '0')
        : 12);
      const alignedLeft = Math.max(8, Math.min(left, window.innerWidth - 32));
      setAnchorLeft(alignedLeft);
      setAnchorWidth(Math.min(430, window.innerWidth - alignedLeft - 12));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    const content = document.querySelector('.content-area');
    if (content) observer.observe(content);
    const contentObserver = new MutationObserver(measure);
    contentObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); contentObserver.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const stop = useCallback(() => {
    const visit = visitRef.current;
    if (!visit || visit.stopped) return;
    visit.stopped = true;
    write(sessionStorage, `${VISIT}:${visit.accountId}`, visit);
    write(localStorage, SEEN, true);
    setStage(null);
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    setStage(null);
    visitRef.current = null;
    if (!accountId || !ready) return;
    const stored = read(sessionStorage, `${VISIT}:${accountId}`);
    visitRef.current = stored || { accountId, startedAt: Date.now(), initial: false, reminder: false, stopped: false };
    if (read(localStorage, DISMISSED)) visitRef.current.stopped = true;
    write(sessionStorage, `${VISIT}:${accountId}`, visitRef.current);
    setRevision((value) => value + 1);
  }, [accountId, ready]);

  useEffect(() => {
    if (searched || engaged) stop();
  }, [searched, engaged, stop, revision]);

  // Product dialogs rendered by cards use portals, so observe their presence
  // without changing product or basket code. Any such engagement ends tips.
  useEffect(() => {
    const inspect = () => {
      if (document.querySelector('.pz-modal, .cart-drawer.open, .cart-drawer.peek')) stop();
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const onPointer = (event) => {
      if (event.target?.closest?.('[data-cart-trigger], .product-card, .pz-modal')) stop();
    };
    const onInput = (event) => {
      if (event.target?.matches?.('input[role="combobox"], #instore-search') && event.target.value.trim()) stop();
    };
    document.addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('input', onInput);
    inspect();
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('input', onInput);
    };
  }, [stop]);

  useEffect(() => {
    const visit = visitRef.current;
    if (!visit || visit.stopped || !browsing || blocked || searched || engaged) {
      setStage(null);
      return undefined;
    }
    const showWhenSafe = () => {
      if (visit.stopped || document.visibilityState !== 'visible' || document.querySelector('[aria-modal="true"], .topnav-modal-backdrop')) return;
      if (!visit.initial && !read(localStorage, SEEN)) {
        visit.initial = true;
        write(localStorage, SEEN, true);
        trackShoppingEvent('search_tip_shown', { tipStage: 'initial' });
        setStage('initial');
      } else if (!visit.reminder && Date.now() - visit.startedAt >= REMINDER_MS) {
        visit.reminder = true;
        trackShoppingEvent('search_tip_shown', { tipStage: 'reminder' });
        setStage('reminder');
      } else return;
      write(sessionStorage, `${VISIT}:${accountId}`, visit);
    };
    showWhenSafe();
    const timer = window.setTimeout(showWhenSafe, Math.max(0, REMINDER_MS - (Date.now() - visit.startedAt)));
    // Revisit a deferred reminder only when the blocking overlay closes or
    // the customer returns to the tab, rather than repeatedly polling.
    const observer = new MutationObserver(showWhenSafe);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('visibilitychange', showWhenSafe);
    return () => { window.clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', showWhenSafe); };
  }, [accountId, blocked, browsing, engaged, ready, revision, searched]);

  useEffect(() => {
    if (!stage) return undefined;
    const timer = window.setTimeout(() => setStage(null), DISPLAY_MS);
    // Do not cover product images once the customer starts moving through
    // the catalogue. Scrolling closes this display without cancelling the
    // optional reminder for customers who have not used search yet.
    const onScroll = (event) => {
      if (event.target?.closest?.('.customer-journey-prompt')) return;
      setStage(null);
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [stage]);

  const dismiss = useCallback((reason = 'dismissed') => {
    if (stage) trackShoppingEvent(reason === 'try_search' ? 'search_tip_search_clicked' : 'search_tip_dismissed', { tipStage: stage });
    write(localStorage, DISMISSED, true);
    stop();
  }, [stop, stage]);
  return { state: stage ? {
    presentation: 'toast', action: 'search', anchorTop, anchorLeft, anchorWidth, eyebrow: stage === 'reminder' ? 'SEARCH TIP' : 'PROTO SEARCH',
    title: 'Find more with Proto search',
    message: 'Search by product name, SKU or barcode, including Instore products. Click a product image for a closer look.',
    primaryLabel: 'Try search', dismissAfterMs: DISPLAY_MS,
  } : null, dismiss };
}
