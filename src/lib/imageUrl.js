const SUPABASE_OBJECT_PATH = '/storage/v1/object/public/';

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

/** Card grid thumbnails — smaller Supabase transforms; other hosts unchanged. */
export function catalogCardImageUrl(url) {
  const raw = (url || '').trim();
  if (!raw) return '';
  const encoded = encodeRemoteUrl(raw);
  if (!encoded.includes(SUPABASE_OBJECT_PATH)) return encoded;

  try {
    const parsed = new URL(encoded);
    parsed.pathname = parsed.pathname.replace(
      SUPABASE_OBJECT_PATH,
      '/storage/v1/render/image/public/',
    );
    parsed.searchParams.set('width', '400');
    parsed.searchParams.set('quality', '80');
    parsed.searchParams.set('resize', 'contain');
    parsed.searchParams.set('format', 'webp');
    return parsed.toString();
  } catch {
    return encoded;
  }
}

export function optimizedImageUrl(url) {
  return encodeRemoteUrl(url);
}

export function buildImageCandidates(url, { variant = 'card' } = {}) {
  const raw = (url || '').trim();
  if (!raw) return [];

  if (variant === 'modal') {
    return [...new Set([optimizedImageUrl(raw), raw].filter(Boolean))];
  }

  const card = catalogCardImageUrl(raw);
  const full = optimizedImageUrl(raw);
  return [...new Set([card, full, raw].filter(Boolean))];
}

/**
 * Avoid optional catalogue/image warming when the browser tells us that the
 * customer is saving data or is on a very slow connection. User-initiated
 * searches and visible images still load normally.
 */
export function shouldPrefetchData(connection = globalThis.navigator?.connection) {
  if (!connection) return true;
  if (connection.saveData === true) return false;
  return !['slow-2g', '2g'].includes(String(connection.effectiveType || '').toLowerCase());
}

/** Warm browser cache for catalogue thumbnails (non-blocking). */
export function preloadProductImages(urls, { limit = 60 } = {}) {
  if (typeof window === 'undefined' || !urls?.length || !shouldPrefetchData()) return;
  const seen = new Set();
  let count = 0;
  for (const url of urls) {
    if (count >= limit) break;
    const src = catalogCardImageUrl(url);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    count += 1;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
}
