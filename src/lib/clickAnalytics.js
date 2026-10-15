import { trackShoppingEvent } from './shoppingAnalytics.js';

/**
 * Website click analytics: one delegated listener records which button or
 * link a signed-in customer clicked, as a `site_clicked` shopping event with
 * { area, label, kind } metadata (and the product code when the click was on
 * a product). The admin Reports "Website clicks" section reads them.
 *
 * Privacy: never the contents of inputs, never anything inside
 * [data-track-ignore], and labels are short UI text with email addresses and
 * long digit runs dropped. Analytics must never delay or block the customer.
 */

/** First match wins; checked against the clicked element and its ancestors. */
export const CLICK_AREAS = [
  ['.checkout-modal, .checkout-modal-backdrop', 'Checkout'],
  ['.order-drawer, .mobile-cart-sheet', 'Basket'],
  ['.sticky-order-bar', 'Order bar'],
  ['.pz-modal', 'Product pop-up'],
  ['.product-card', 'Product card'],
  ['.instore-result-card', 'Instore products'],
  ['.mega-menu-flyout', 'Mega menu'],
  ['.cat-nav', 'Department menu'],
  ['.sidebar-container, .sidebar-rail', 'Sidebar'],
  ['.strip-card, .cat-landing-hero', 'Department tiles'],
  ['.theme-card', 'Theme cards'],
  ['.results-control', 'Sort & filters'],
  ['.header-search-premium-wrap', 'Search bar'],
  ['.app-header, header', 'Header'],
  ['footer', 'Footer'],
  ['[role="dialog"], .topnav-modal', 'Pop-up'],
];

const CLICKABLE = 'button, a[href], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="radio"], [data-track-label]';
const MAX_LABEL = 60;
const MAX_PER_MINUTE = 40;

/** Short, safe UI text — or '' when it might hold personal details. */
export function cleanClickLabel(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text || /@/.test(text)) return '';
  const safe = [...text.replace(/\d[\d\s-]{5,}\d/g, '#')]
    .filter((character) => { const code = character.charCodeAt(0); return code >= 32 && !(code >= 127 && code <= 159); })
    .join('');
  return safe.length > MAX_LABEL ? `${safe.slice(0, MAX_LABEL - 1).trimEnd()}…` : safe;
}

export function clickAreaFor(element) {
  for (const [selector, area] of CLICK_AREAS) {
    if (element?.closest?.(selector)) return area;
  }
  return 'Page';
}

function kindOf(element) {
  if (element.closest('.product-card, .pz-modal, .instore-result-card')) return 'product';
  if (element.matches('a[href], [role="link"]')) return 'link';
  return 'button';
}

/** What a click hit, or null when it should not be recorded. */
export function describeClick(target) {
  const element = target?.closest?.(CLICKABLE);
  if (!element || element.closest('[data-track-ignore]')) return null;
  if (element.matches('input, textarea, select, [contenteditable="true"]')) return null;
  const label = cleanClickLabel(
    element.getAttribute('data-track-label')
    || element.getAttribute('aria-label')
    || element.getAttribute('title')
    || element.textContent,
  ) || (element.querySelector?.('svg') ? 'Icon button' : '');
  if (!label) return null;
  const productId = element.closest('[data-product-code]')?.getAttribute('data-product-code') || null;
  return { area: clickAreaFor(element), label, kind: kindOf(element), productId: productId ? productId.slice(0, 128) : null };
}

/** Start listening; returns the stop function. One listener per page. */
export function startClickAnalytics({ doc = typeof document !== 'undefined' ? document : null, track = trackShoppingEvent, now = () => Date.now() } = {}) {
  if (!doc) return () => {};
  let last = { key: '', at: 0 };
  let windowStart = 0;
  let count = 0;
  const onClick = (event) => {
    try {
      const hit = describeClick(event.target);
      if (!hit) return;
      const at = now();
      const key = `${hit.area}|${hit.label}|${hit.productId || ''}`;
      if (key === last.key && at - last.at < 800) return;
      last = { key, at };
      if (at - windowStart > 60_000) { windowStart = at; count = 0; }
      if (++count > MAX_PER_MINUTE) return;
      const fields = { metadata: { area: hit.area, label: hit.label, kind: hit.kind } };
      if (hit.productId) { fields.productId = hit.productId; fields.source = hit.area === 'Instore products' ? 'instore' : 'main'; }
      track('site_clicked', fields);
    } catch {
      // never let analytics break a click
    }
  };
  doc.addEventListener('click', onClick, { capture: true, passive: true });
  return () => doc.removeEventListener('click', onClick, { capture: true });
}
