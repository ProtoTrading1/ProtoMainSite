/** Reset every scroll container the portal may use (layout varies by breakpoint). */
export function scrollToTop() {
  if (typeof document === 'undefined') return;

  for (const selector of ['.content-area', '.main-layout', '.app-root']) {
    const el = document.querySelector(selector);
    if (!el) continue;
    try {
      el.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }

  try {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  } catch {
    /* ignore */
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
