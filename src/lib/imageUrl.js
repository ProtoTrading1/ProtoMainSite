function encodeRemoteUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.pathname = parsed.pathname
      .split('/')
      .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
      .join('/');
    return parsed.toString();
  } catch {
    return url;
  }
}

export function optimizedImageUrl(url) {
  return encodeRemoteUrl(url);
}

export function buildImageCandidates(url) {
  const raw = (url || '').trim();
  if (!raw) return [];
  const candidates = [optimizedImageUrl(raw), raw];
  return [...new Set(candidates.filter(Boolean))];
}

/** Warm browser cache for catalogue thumbnails (non-blocking). */
export function preloadProductImages(urls, { limit = 24 } = {}) {
  if (typeof window === 'undefined' || !urls?.length) return;
  const seen = new Set();
  let count = 0;
  for (const url of urls) {
    if (count >= limit) break;
    const src = optimizedImageUrl(url);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    count += 1;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
}
