/** Reset every scroll container the portal may use (layout varies by breakpoint). */
export function scrollToTop() {
  scrollContainers('auto');
}

/** Smooth scroll for intentional Home navigation. Respects reduced motion. */
export function scrollToTopSmooth() {
  const reduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  scrollContainers(reduced ? 'auto' : 'smooth');
}

function scrollContainers(behavior) {
  if (typeof document === 'undefined') return;

  for (const selector of ['.content-area', '.main-layout', '.app-root']) {
    const el = document.querySelector(selector);
    if (!el) continue;
    try {
      el.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }

  try {
    window.scrollTo({ top: 0, left: 0, behavior });
  } catch {
    /* ignore */
  }
  if (behavior === 'auto') {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
}
